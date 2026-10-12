# cnh_data — os dados digitados na CNH são verdadeiros?

Modelo que avalia os **dados do formulário** de cadastro de CNH (`CNHUpload.tsx`) e calcula um
**índice de veracidade** (0 a 100). Roda ao salvar a CNH; se os dados parecerem falsos, o cadastro
**continua liberado**, mas já é gravado como `rejected` com o motivo em `review_note`. O índice é
guardado em `OperatorLicense.veracity_score`.

O índice junta duas fontes de evidência:

1. **Consistência com a foto**: o servidor roda o OCR do `cnh_image` no arquivo salvo e compara os
   campos que ele leu com confiança (CPF, nº de registro, datas...) com o que foi digitado.
2. **Plausibilidade dos dados** (o fallback): regras duras e um classificador de ML, que valem
   sozinhos quando o OCR leu pouco ou nada (nomes contra a base do IBGE, coerência de nascimento,
   emissão e validade...).

Decisões registradas nas ADRs
[0002](../../../Documentation/adr/0002-validacao-de-plausibilidade-dos-dados-da-cnh.md) (plausibilidade)
e [0004](../../../Documentation/adr/0004-indice-de-veracidade-dados-x-ocr.md) (cruzamento com o OCR).

O código continua independente do modelo que olha a foto ([`cnh_image`](../cnh_image/README.md)):
este modelo só **recebe** o resultado do OCR como dado (o Django faz a ponte); a comparação dos dois
está em [`../README.md`](../README.md).

## Fluxo

```
POST/PUT/PATCH /api/operator-licenses
        │
        ▼
OperatorLicenseService.create/update      grava a CNH como pending (update zera a análise anterior)
        │
        ▼
_screen_license()                         ML_PLAUSIBILITY_MODE: off | shadow | enforce
        │
        ├─ file_url aponta para um arquivo salvo em MEDIA_ROOT/documents?
        │     sim ─► ml/cnh_image/classify.py lê a foto (OCR) ─► campos + uncertain_fields
        │     não / OCR falhou / layout não reconhecido ─► ocr = null (só plausibilidade)
        │
        │  {"record": {...}, "ocr": {...} | null}  no stdin
        ▼
ml/cnh_data/classify.py                   consistência com o OCR + regras duras + classificador de ML
        │  {"is_suspicious", "score", "veracity", "basis", "consistency",
        │   "mismatch_fields", "reasons", "fields"}
        ▼
OperatorLicense.veracity_score = veracity (shadow e enforce)
        │
suspeita e modo enforce?  ── sim ──►  validation_status = rejected, auto_rejected = true
                                       review_note =
                                         "Os dados informados não conferem com o documento enviado
                                          (números dos documentos). Corrija e reenvie, ..."   ← foto contradiz
                                         ou "... parecem inconsistentes ou falsos (nome, datas). ..."
```

O servidor roda o OCR de novo no arquivo salvo, em vez de confiar no que o front leu, para que o
cliente não possa mandar um OCR inventado que bata com dados falsos. `file_url` vem do cliente:
só vale um nome simples dentro de `MEDIA_ROOT/documents/` (qualquer outro caminho é ignorado).
O OCR roda a cada salvamento e edição (+~3 s).

A edição (`PUT`/`PATCH`) volta a CNH para `pending` e **reavalia**: corrigir os dados tira a
recusa, e uma edição ainda suspeita volta a ser recusada. Uma decisão de administrador
(`/review`) substitui a do modelo e zera `auto_rejected`.

## Arquivos: o que gera o modelo, o que o usa e o que é apoio

```
cnh_data/
├── train.py                      ◄ GERA O MODELO: lê o CSV sintético, treina, avalia, salva o .joblib
├── classify.py                   ◄ USA O MODELO: o Django chama este script (registro no stdin)
├── models/cnh_plausibility.joblib   o modelo treinado (versionado, como o .keras)
│
├── scripts/                      preparam os DADOS que o train.py lê (rodam antes, uma vez)
│   ├── build_reference_data.py       CSVs do IBGE (data/raw)  →  data/names + data/cities
│   ├── generate_synthetic_data.py    IBGE + data/lexicon      →  data/synth/cnh_records.csv
│   └── evaluate_veracity.py          calibra o índice contra leituras reais do OCR (não gera modelo)
│
├── lib/                          código de apoio, importado pelos scripts (não roda sozinho)
│   ├── rules.py       camada 1: regras duras
│   ├── features.py    registro → vetor de números (camada 2)
│   ├── consistency.py  camada 3: digitado × OCR da foto, campo a campo (sem ML)
│   ├── veracity.py    junta plausibilidade e consistência no índice de veracidade
│   ├── model.py       PlausibilityModel (ML) e assess() (regras + ML + consistência = decisão final)
│   ├── reference.py   consulta às bases do IBGE (nome, cidade)
│   ├── record.py      utilitários do registro: datas, CPF, birth_place, padrões de dígitos/teclado
│   └── synthetic.py   gerador dos registros plausíveis/falsos e leitura/escrita do CSV
│
└── tests/                        testes unitários (rodam no venv de ML)
```

Os dados ficam em [`../data`](../data/README.md), compartilhados com o `cnh_image`. De onde vêm as
bases do IBGE (e os links das fontes) está em
[`../data/README.md`](../data/README.md#referências-de-onde-vêm-os-dados):

| Pasta | Papel para este modelo |
|---|---|
| `data/names`, `data/cities` | bases do IBGE (nomes e municípios); entrada de `lib/reference.py` |
| `data/lexicon/lexicon.csv` | listas de palavras escritas à mão que o gerador usa (sobrenomes, palavras comuns, "teste"...) |
| `data/synth/cnh_records.csv` | **o dataset sintético** que o `train.py` lê (gerado, fora do git) |
| `data/eval/adversarial_cases.json` | 37 casos escritos à mão para avaliar |
| `data/eval/ocr_readings.jsonl` | leituras do OCR das fotos de validação do BID + verdade, para `evaluate_veracity.py` (gerado por `cnh_image/scripts/export_readings.py`, fora do git) |
| `data/raw` | CSVs brutos do IBGE (fora do git) |

**Ordem das coisas** (só o `train.py` é necessário no dia a dia; ele gera o CSV sozinho se faltar):

```
data/raw/*.csv ──build_reference_data.py──► data/names + data/cities ─┐
data/lexicon/lexicon.csv ─────────────────────────────────────────────┤
                                  generate_synthetic_data.py ◄────────┘
                                            │
                                            ▼
                                 data/synth/cnh_records.csv ──train.py──► models/cnh_plausibility.joblib
                                                                                      │
                                                                  Django ──classify.py┘
```

Adaptador no Django: `document_validation/ml_adapters/cnh_data.py` (`CnhDataChecker`).

## Camada 1 — regras duras (`rules.py`)

Fatos verificáveis, sem estatística: se uma regra dispara, o registro é suspeito com certeza
(`score = 1.0`) e o motivo é exato. Várias repetem o Zod do front, porque o **backend não
valida isso**: quem chama a API direto, sem o formulário, também passa por aqui.

| Grupo | Regra (`code`) | Dispara quando |
|---|---|---|
| nomes (nome, mãe, pai e **cidade**) | `name_placeholder` | token como `teste`, `fulano`, `asdf`, `xxx`, `nome` |
| | `name_has_digits`, `name_without_letters` | números no nome, ou nenhuma letra |
| | `name_repeated_chars` | 4+ letras iguais seguidas (`aaaa`) |
| | `name_keyboard_mash` | 5+ teclas vizinhas (`asdfg`, `poiuy`) |
| | `name_no_vowels` | palavra de 5+ letras sem vogal (`xkqptz`) |
| | `name_equals_mother`, `parents_equal` | nome igual ao da mãe; mãe igual ao pai |
| números | `cnh_number_length` | CNH sem 11 dígitos |
| | `cpf_invalid` | CPF sem 11 dígitos, repetido ou com dígito verificador errado |
| | `rg_too_short` | RG com menos de 5 dígitos |
| | `number_low_variety` | CNH/CPF/RG com 2 dígitos distintos ou menos |
| | `number_sequential` | 7+ dígitos consecutivos (`1234567`, `9876543`), mesmo com CPF válido |
| datas | `invalid_date` | data que não é `AAAA-MM-DD` |
| | `birth_implausible` | nascimento antes de 1900 ou com menos de 18 anos |
| | `first_license_before_18` | 1ª habilitação antes dos 18 |
| | `issue_before_first_license` | emissão anterior à 1ª habilitação |
| | `expiration_not_after_issue` | validade igual ou anterior à emissão |
| | `validity_too_long` | validade a mais de 10 anos da emissão (+31 dias de tolerância) |
| | `date_in_future` | 1ª habilitação ou emissão no futuro |
| UF | `birth_state_invalid`, `issuing_state_invalid` | UF inexistente |

**Não são regras** (de propósito, porque pessoas legítimas as violam): nome fora da base do IBGE,
lugar de nascimento fora da lista de municípios da UF (distritos, bairros, localidades menores,
as Regiões Administrativas do DF e municípios emancipados depois do nascimento são cadastros
legítimos), nome igual ao do pai (pai e filho com o mesmo nome existem).
Esses viram *features* do classificador.

Falso positivo medido das regras de texto: de **33.075 primeiros nomes do IBGE**, só 4
disparam, e são lixo dentro da própria base (`lorem`, `fulano`, `nada`, `trwfc`); **0 das 5.571
cidades** disparam; 0 em 20 mil registros plausíveis sintéticos.

## Camada 2 — classificador de ML (`features.py`, `model.py`)

`HistGradientBoostingClassifier` (aceita `NaN` nativamente, para pai ausente e cidade de
estrangeiro) com calibração isotônica, que estima `P(dado falso)`. Ele nunca vê o texto cru,
só ~120 features numéricas em 8 grupos (o grupo explica a recusa):

| Grupo | Exemplos de features |
|---|---|
| `name`, `mother_name`, `father_name` | tamanho, razão de vogais, maior repetição, maior sequência de consoantes, trecho de teclas vizinhas, padrão `jkjkjk`, **nota do modelo de caracteres**, **frequência do 1º nome no IBGE** (`known`, `log10(freq)`) |
| `birth_place` | `city_exact` (a cidade é um município da UF, pela DTB do IBGE), `city_similarity` (tolera "Sao Paulo", "Moji"), `city_elsewhere` (existe em outra UF); neutro para estrangeiro |
| `dates` | idade na 1ª habilitação e na emissão, anos entre elas, prazo de validade, flags de ordem das datas |
| `documents` | dígitos distintos, maior repetição e maior sequência em CNH/CPF/RG, CPF válido |
| `license` | UF de emissão × órgão emissor, categoria avançada, pontos, situação, ACC/EAR |
| `notes` | as mesmas métricas de texto para observações e restrições médicas |

- **Modelo de caracteres** (`CharLM`): trigramas treinados nos primeiros nomes do IBGE, cada nome
  pesando `log10(nascimentos)`. "Joaquim" tem nota alta, "xkqpt" baixa.
- **Nota de anomalia**: um `IsolationForest` treinado só com registros plausíveis (40% deles,
  separados do treino do classificador) vira mais uma feature. Pega desvios que nenhum exemplo
  falso previu.
- **Frequência do nome e cidade são sinais brandos.** A base do IBGE só tem nomes com 10+
  ocorrências por município, sem sobrenomes e sem nascidos depois de 2010.
- **Explicação**: `PlausibilityModel.explain` neutraliza um grupo de cada vez (troca pela mediana
  dos plausíveis) e vê quanto a nota cai; os até 3 grupos que mais pesam viram o campo `fields`
  (`nome`, `nome da mãe`, `datas`...), em português, usado na `review_note`. A mensagem cita
  campos, **nunca as regras nem o limiar**.

## Camada 3 — consistência com a foto e índice de veracidade (`consistency.py`, `veracity.py`)

Sem ML: igualdades e uma similaridade de texto. Cada campo que o OCR devolveu é comparado com o
digitado, e o resultado é `match`, `mismatch` ou `absent` (campo que o OCR não leu, ou que o
formulário deixou vazio, **nunca** conta como divergência). Cada campo tem um **peso** que reflete a
precisão medida do OCR (veja `cnh_image/README.md`):

| Peso | Campos | Como compara |
|---|---|---|
| 1,0 (fortes) | `cpf`, `cnh_number`, `birth_date`, `first_license_date`, `issue_date`, `expiration_date` | igualdade (dígitos / data ISO); o OCR acerta 99–100% |
| 0,5 | `issuing_state`, e `category`, `rg`, `name` **só se o OCR não os marcou como incertos** | igualdade; nome por similaridade ≥ 0,85 (tolera uma letra errada e acento) |
| 0,25 | `mother_name`, `father_name`, `birth_place` | filiação vale se bater com a mãe **ou** o pai digitados (a ordem do OCR é heurística); local compara UF e similaridade da cidade |

`evidência` é a soma dos pesos dos campos comparados e `concordância`, a fração ponderada que
bate. O índice combina com a plausibilidade (`P(falso)` do modelo, já com a regra do local de
nascimento):

```
w      = min(1, evidência / 3)          (0 se evidência < 1: o OCR é ignorado)
falso  = w · (1 − concordância) + (1 − w) · P(falso)
veracity = round(100 · (1 − falso))
```

Com pouco ou nenhum OCR, `w = 0` e o índice é exatamente a plausibilidade: **o fallback é o próprio
modelo de antes**, sem caminho de código separado (`basis = "plausibility"`; com OCR,
`"ocr+plausibility"`). Com vários campos fortes batendo, o OCR "avaliza" o registro e a suspeita do
modelo (nome raro, cidade fora da lista...) pesa pouco.

**Recusa** (`is_suspicious`) quando, nesta ordem:

1. uma **regra dura** dispara: o OCR bater não adianta (CPF inválido, datas impossíveis...);
2. há **divergência dura** com o OCR (o CPF diverge, ou duas divergências em campos fortes), mesmo
   que o modelo goste dos dados: o OCR é 99–100% preciso nesses campos, então não é erro de leitura.
   A nota fica em, no mínimo, 0,95;
3. a nota combinada chega ao limiar (`ML_PLAUSIBILITY_THRESHOLD`, 0,60).

Uma divergência isolada em um campo forte (um dia de emissão trocado) **não** recusa sozinha. Quando é
a foto que contradiz o digitado, a mensagem ao dono é "não conferem com o documento enviado (campos)",
sem valores nem pesos.

**O que isto não prova**: consistência não é autenticidade. Quem sobe a foto de uma CNH alheia e
digita os dados dessa mesma foto passa. O cruzamento pega dados digitados que **não** correspondem
ao documento enviado, e quem aceita o preenchimento automático do front bate por construção.

### Calibração (`scripts/evaluate_veracity.py`)

Simula cadastros contra as leituras reais do OCR das 356 fotos de validação do BID que tiveram
campos lidos (`ml/data/eval/ocr_readings.jsonl`). A nota de plausibilidade é sorteada entre as de
registros sintéticos plausíveis não vistos no treino, e as regras duras ficam de fora: os nomes do BID
são fictícios com o sobrenome primeiro (o modelo recusaria 78% deles) e as datas são aleatórias.
Resultado no limiar 0,60 (não muda de 0,40 a 0,80: quem decide é a divergência dura):

| Cenário | Recusado |
|---|---|
| honesto (digita o que está na foto) | 0,0% |
| honesto, e o modelo desconfia (P = 0,8) | 0,0% |
| honesto, OCR com 2, 1 ou 0 campos | 0,0% |
| uma data errada (digitação) | 0,8% |
| CPF de outro documento* | 100% |
| nº de registro e emissão de outro* | 100% |
| tudo de outro documento | 99,7% |
| dados plausíveis inventados | 99,7% |

\*só nas fotos em que o OCR leu o campo trocado (o que o OCR não leu não pode ser contradito).
Limites: a "digitação" simulada é perfeita (sem erros de quem digita de verdade), o dataset é
sintético e o OCR em fotos reais pode errar mais. Por isso, **comece em `shadow`**.

```bash
./ml/venv/bin/python ml/cnh_image/scripts/export_readings.py      # OCR das fotos de validação (~4 min)
./ml/venv/bin/python ml/cnh_data/scripts/evaluate_veracity.py     # simula e imprime a tabela acima
```

## Contrato do `classify.py`

```bash
echo '{"record": {"name": "Asdfghjkl", "cpf": "52998224725", ...}, "ocr": null}' \
  | ./ml/venv/bin/python ml/cnh_data/classify.py
```

```json
{"is_suspicious": true, "score": 1.0, "veracity": 0, "basis": "plausibility",
 "reasons": ["nome com teclas vizinhas (asdf...)"], "fields": ["nome"],
 "consistency": {"cpf": "absent", "...": "absent"}, "mismatch_fields": []}
```

- Entrada: `{"record": {...}, "ocr": {"fields": {...}, "uncertain_fields": [...]} | null}`.
  `ocr` é a saída do `cnh_image` (as mesmas chaves do `record`); `null` avalia só a plausibilidade.
- Saída: `score` é a nota de "dado falso" **já combinada** (1.0 se uma regra disparou), e `veracity`
  é `round(100 · (1 − score))`. `basis` diz se o OCR entrou. `consistency` traz o status de cada campo
  comparável (só nomes de campo, nunca valores) e `mismatch_fields` os grupos que a foto contradiz de
  forma inequívoca (vazio se a recusa não veio daí).

- Campos do registro: os do `OperatorLicenseInputSerializer` (`name`, `birth_date`, `cpf`, `rg`,
  `mother_name`, `father_name`, `nationality`, `birth_place` "Cidade – UF", `cnh_number`,
  `category`, `first_license_date`, `issue_date`, `expiration_date`, `issuing_state`,
  `issuing_authority`, `situation`, `acc`, `ear`, `medical_restrictions`, `observations`, `points`).
  `birth_place` aceita `–`, `-` ou `/` como separador; também vale mandar `birth_city`/`birth_state`.
- Sem OCR: `is_suspicious = alguma regra dura OU (score ≥ limiar E há outra evidência além do
  local de nascimento)`. Com OCR, soma-se a divergência dura e a combinação descritas acima.
- `reasons` traz só os motivos das regras (o Django os registra no log, sem dado pessoal);
  `fields` os grupos de campos, usados na mensagem ao usuário.
- Sem modelo ou sem bases: mesmo formato, `is_suspicious: false`, `veracity: null` e `error` preenchido.
- Entrada inválida (stdin vazio, sem `record` objeto ou com `ocr` que não é objeto): `{"error": ...}` e
  saída com código 1.

## Configuração

| Variável | Padrão | Efeito |
|---|---|---|
| `ML_PLAUSIBILITY_MODE` | `enforce` | `off` não avalia (nem roda o OCR); `shadow` avalia, grava `veracity_score` e só registra em log (id da CNH, score, índice e campos, sem dados pessoais); `enforce` também recusa |
| `ML_PLAUSIBILITY_THRESHOLD` | `0.60` | A partir de qual probabilidade o modelo recusa (política agressiva). Sobe-se o limiar para recusar menos |

> **Comece em `shadow`.** O limiar foi escolhido sobre dados sintéticos, sem tráfego real. Em
> `shadow` dá para ver quantos cadastros reais seriam recusados antes de ligar o `enforce`.

## Local de nascimento sozinho nunca recusa

As listas do IBGE têm lacunas que nunca serão totalmente fechadas (bairros, povoados, localidades
menores). Com uma lista quase completa nos exemplos plausíveis, o classificador aprende
"lugar fora da lista ⇒ falso" com muita força (nota 1,00), e recusaria pessoas reais. A regra
(`PLACE_ALONE_FLOOR` em `lib/model.py`): o ML só conta como suspeito se, **trocando o local de
nascimento pela mediana dos plausíveis, a nota ainda for ≥ 0,20**, ou seja, se houver outra
evidência. O local continua pesando junto com outros sinais.

Efeito: `Curitiba – SP` sozinho (UF errada) e uma cidade pronunciável mas inexistente, com o resto
normal, **não são recusados**. Cidade de teclado, repetida ou sem vogal continua recusada pelas
**regras duras**, que valem para a cidade também. A nota (`score`) reportada nesses casos é a
nota sem o local, que foi a que decidiu.

## Política de falha: fail-open

Diferente do `cnh_image` (que devolve `is_valid: false` quando falha), este modelo **muda o
estado de um cadastro**, então qualquer falha técnica (modelo ou bases ausentes, timeout de
10 s, processo com erro, saída que não é JSON) vira "não suspeito" e é só registrada em log.
Um erro de infraestrutura nunca recusa o cadastro de ninguém.

Como as bases de `ml/data/names` e `ml/data/cities` e o `.joblib` são o que mantém o modelo
funcionando, os três são **versionados** (veja `ml/data/README.md`). Um clone sem eles não
quebra, mas também não recusa nada.

## Dados de treino

Não existe base pública de cadastros falsos de CNH (dados de fraude são privados), então o
treino usa dados **sintéticos**, gerados por `lib/synthetic.py` (determinístico por semente) e gravados em `data/synth/cnh_records.csv`:

**Positivos (plausíveis)** — nomes sorteados pela frequência real do IBGE (com gênero
aproximado pela terminação), sobrenomes de uma lista escrita à mão e de prenomes usados como
sobrenome, cidade sorteada entre os municípios da UF, CPF válido, datas coerentes. Inclui de
propósito casos esquisitos mas reais, para o modelo não aprender que "incomum = falso": 4% de
prenomes raros ou estrangeiros, 5% de cidade com erro de digitação, estrangeiros com cidade fora do Brasil, pai ausente, CNHs de validade 3/5/10 anos
e números de documento com dígitos quase todos distintos.

**Negativos (falsos)** — um plausível corrompido por 1 a 3 *famílias* de mutação:

| Família | O que simula | Sozinha? |
|---|---|---|
| `keyboard` | `asdfghjkl`, `jkjkjk` no nome | sim |
| `repeat` | `aaaaa`, `lalala`, `111` | sim |
| `placeholder` | `Teste`, `Fulano de Tal`, `Nome Sobrenome` | sim |
| `word_junk` | palavras comuns no lugar do nome (`Banana Azul`) | sim |
| `gibberish` | letras aleatórias (`Xkqpt Zrvbn`) | sim |
| `same_name` | nome igual ao da mãe, ou mãe igual ao pai | sim |
| `dates_inverted` | validade antes da emissão, habilitação aos 15, validade de 30 anos | sim |
| `numbers_degenerate` | `11111111111`, `12345678901`, CPF sequencial com dígito válido | sim |
| `city_gibberish` | cidade sem sentido | sim |
| `one_field` | só o nome corrompido | sim |
| `full_junk` | todos os campos lixo | sim |
| `city_wrong_state` | cidade real numa UF errada | só combinada |
| `invented_name` | nome pronunciável inventado | só combinada |

As duas últimas só aparecem combinadas com outra família, porque sozinhas são ambíguas (erro de
UF ou nome raro real). O número de dígitos distintos é um **atalho** que o gerador já induziu uma
vez: todos os números sequenciais de exemplo tinham 10 dígitos distintos e o modelo aprendeu
"10 distintos = falso". Por isso os positivos agora têm 10% de números com quase todos os dígitos
distintos, e os negativos sequenciais começam em qualquer dígito.

## Treinar e avaliar

```bash
cd BackEnd
./ml/venv/bin/python ml/cnh_data/train.py              # completo (~15 min); grava o modelo
./ml/venv/bin/python ml/cnh_data/train.py --quick      # usa parte do CSV, para testar o pipeline
./ml/venv/bin/python ml/cnh_data/train.py --no-save --skip-unseen
```

Se `data/synth/cnh_records.csv` não existir, o `train.py` o gera antes. Para regenerá-lo à parte
(ou mudar o tamanho), e para refazer as bases do IBGE a partir dos CSVs de `data/raw/`:

```bash
./ml/venv/bin/python ml/cnh_data/scripts/generate_synthetic_data.py --positives 24000 --negatives 20000
./ml/venv/bin/python ml/cnh_data/scripts/build_reference_data.py
```

O `train.py` imprime três avaliações, todas pela mesma `assess()` da produção (regras + ML):

1. **Holdout 20%** do CSV, no total e por família de lixo.
2. **"Deixa uma família de fora"**: treina sem as linhas que têm a família e mede a detecção das
   linhas só dela (filtrando o próprio CSV, sem gerar nada), para estimar a generalização para
   lixo que ninguém previu.
3. **37 casos escritos à mão** (`data/eval/adversarial_cases.json`): 19 legítimos incomuns (nome
   japonês, árabe, alemão, prenome raro, distrito, estrangeiro, sem pai, particípios...) que **não
   podem** ser recusados; 16 falsos típicos que **têm de** ser; e 2 ambíguos só informativos.

Metas (o script avisa com `[ATENÇÃO]` quando não são atingidas): recall ≥ 95% e falso positivo
≤ 2% no holdout; 0 legítimos recusados e 0 falsos liberados nos casos à mão; recall ≥ 85% nas
famílias não vistas.

## Resultados

Treino completo de 12/10/2026, com UF e municípios só da DTB 2025, sobre `data/synth/cnh_records.csv` (24.000 registros plausíveis e
20.000 falsos sintéticos, semente 42), limiar 0,60. As famílias "não vistas" são avaliadas
filtrando o próprio CSV: treina-se com 1/3 das linhas que não têm a família e testa-se nas linhas
que têm só ela.

**Holdout sintético (8.800 registros):**

| | Recall | Falso positivo | Precisão |
|---|---|---|---|
| Só o classificador de ML | 93,6% | 0,12% | 99,8% |
| Regras + ML (produção) | 95,8% | 0,12% | 99,8% |

PR-AUC do ML (nota bruta, sem a regra do local de nascimento): 1,000.

**Recall por família** (família vista no treino) e **por família não vista**:

| Família | Vista (regras + ML) | Não vista (regras + ML) | Não vista (só ML) |
|---|---|---|---|
| `keyboard` | 100% | 100% | 100% |
| `repeat` | 100% | 100% | 100% |
| `placeholder` | 100% | 100% | 89% |
| `word_junk` | 98% | 89% | 89% |
| `gibberish` | 100% | 100% | 99,9% |
| `same_name` | 100% | 100% | 0,5% |
| `dates_inverted` | 100% | 97% | 0,3% |
| `numbers_degenerate` | 98,6% | 86,0% | 0,2% |
| `city_gibberish` | **36%** | **36%** | 0,2% |
| `one_field` | 98% | 98% | 98% |
| `full_junk` | 100% | 100% | 100% |

**Casos escritos à mão (37):** os 19 legítimos foram liberados (todos com nota até 0,20) e os 16
falsos recusados. Dos 2 ambíguos, só informativos, "cidade existente em outra UF" (`Curitiba – SP`)
foi liberado (0,00) e "prenome inventado pronunciável" recusado (1,00).

**Local de nascimento no modelo final** (mesmo cadastro plausível, só a naturalidade muda):
São Paulo, Barão Geraldo (distrito, fora da lista), Taguatinga, Ceilândia, Gama (DF), Copacabana (bairro), uma
cidade inexistente pronunciável e `Curitiba – SP` ficam todos liberados (nota 0,00). Antes da
regra "local sozinho nunca recusa", as quatro últimas e as do DF eram recusadas com nota 1,00.

**Como ler isso:**

- O ML só reconhece o lixo que viu: a coluna "Não vista (só ML)" é ~0% para `same_name`,
  `dates_inverted`, `numbers_degenerate` e `city_gibberish`. Quem cobre lixo inédito dessas
  famílias são as **regras duras**, e é por isso que a coluna "regras + ML" fica alta nelas.
- **Troca assumida: cidade sem sentido sozinha.** Com a regra "local de nascimento sozinho nunca
  recusa", um cadastro normal com só a cidade inventada não é recusado pelo ML. Só as regras duras
  pegam (cidade com teclado, letras repetidas ou palavra sem vogal), por isso `city_gibberish` fica
  em ~36% (era 96% antes da regra). Foi escolha deliberada: recusar com nota 1,00 quem nasceu em
  Taguatinga ou num bairro era pior do que deixar passar uma cidade falsa isolada. O recall do
  holdout caiu de 99,3% para 95,8% pelo mesmo motivo.
- **Distrito Federal sem lista extra.** A DTB do IBGE lista só Brasília para o DF, e o projeto usa
  apenas a DTB como fonte de lugares. Quem nasceu em Taguatinga, Ceilândia ou Gama aparece como lugar
  desconhecido e **só não é recusado por causa da regra acima**: sem ela, o classificador dava nota
  1,00 a um cadastro legítimo com essa naturalidade (testado em 12/10/2026).
- `numbers_degenerate` não vista (86,0%) só atinge a meta de 85% graças às regras de sequência e de
  baixa variedade; `city_gibberish` (36%) é a única que fica longe da meta.
- **Sem a lista de distritos.** Uma versão anterior também usava os 4.894 distritos da DTB como
  "lugar conhecido". Retirada, as métricas ficaram equivalentes (recall 95,8% → 95,3%, falso
  positivo 0,12% → 0,15%), porque a regra do local de nascimento já protege quem nasceu num distrito.
  Tirar também o peso de população do `cities.json` (as cidades passaram a ser sorteadas de forma
  uniforme entre os municípios) não mudou nada: recall 95,8% e falso positivo 0,12%.
- Os números são sobre dados sintéticos e são otimistas. A decisão de produção deve vir de um
  período em `shadow`.

## Limitações

- **Os números sintéticos são otimistas**: medem o quanto o modelo aprendeu o gerador. Valem mais
  a avaliação por família não vista e os casos à mão, e nada substitui tráfego real.
- **O ML só reconhece o tipo de lixo que viu no treino.** Restrições de monotonicidade foram
  testadas e não ajudaram a extrapolar (e dobraram o falso positivo), então foram descartadas.
  Lixo inédito é coberto pelas regras duras e pela nota de anomalia.
- **Consistência não é autenticidade**: um cadastro bem preenchido com os dados de uma foto alheia
  passa. O OCR só desmente dados que não correspondem ao documento enviado, e só onde leu o campo
  (~78–84% das fotos por campo forte; CNH física nova nunca foi testada).
- A validade dos **dígitos verificadores da CNH** não é usada: o algoritmo precisa ser confirmado
  com CNHs reais antes de virar sinal (um erro aqui recusaria CNHs verdadeiras).
- Sobrenomes não estão na base do IBGE; só o modelo de caracteres os cobre.
- Cada avaliação paga um processo Python (~1 s de import do scikit-learn).
- O `.joblib` é acoplado à versão do scikit-learn (`ml/requirements.txt`); `load` recusa um arquivo
  cujas features não batam com `features.py`.

## Privacidade (LGPD)

CPF, nome e nome da mãe são dados pessoais. O registro vai ao processo pelo **stdin** (não
aparece em `ps`), o modelo só vê **features numéricas derivadas**, o log do Django guarda apenas o
id da CNH, o score, o índice e os grupos de campos (nunca os valores lidos pelo OCR), e
`ml/data/synth/` contém só dados sintéticos. O OCR é refeito a cada salvamento e não é guardado.
`veracity_score` é um número, sem dados pessoais.

## Retreino com dados reais

O caminho para sair do sintético:

1. Rodar em `shadow` e depois `enforce`: cada recusa fica marcada com `auto_rejected = true`.
2. Decisões de administradores (`auto_rejected = false`, via `/review`) viram **rótulos reais**.
   Não use as recusas automáticas como rótulo, senão o modelo aprende com a própria saída.
3. Rodada de "lixo humano": o time preenche o formulário "só para enviar" (100–300 registros) numa
   planilha em `ml/data/human_junk/`; metade treina, metade avalia (hoje não é lida por nenhum script).
4. Guardar as *features* (não o texto cru) e a decisão do admin para um dataset real.
5. Retreinar e comparar com o modelo atual antes de trocar.

## Testes

```bash
./ml/venv/bin/python -m unittest discover -s ml/cnh_data/tests -t ml/cnh_data
```

Cobrem normalização e bases (`test_reference`), cada regra (`test_rules`), features
(`test_features`), gerador sintético e leitura/escrita do CSV (`test_synth_data`), gerador das bases
(`test_build_reference_data`), modelo e decisão (`test_model`) e o CLI (`test_classify`; os testes
com o modelo real são pulados se o `.joblib` não existir), consistência (`test_consistency`) e o
índice (`test_veracity`). A integração no Django está em `document_validation/tests.py`
(`OperatorLicenseScreeningTests`, `OperatorLicenseVeracityTests`, `CnhDataCheckerTests` e, com foto
real do dataset, `OperatorLicensePhotoConsistencyEndToEndTests`).
