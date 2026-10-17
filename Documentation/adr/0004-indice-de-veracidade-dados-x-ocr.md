# ADR 0004: Índice de veracidade: dados digitados × OCR da foto

**Status:** Aceito
**Data:** 2026-10-12

## Contexto

O `ml/cnh_data` (ADR 0002) julgava só se os dados digitados **parecem reais**. Com o OCR do
`ml/cnh_image` (ADR 0003) passou a ser possível julgar também se eles **conferem com o documento
enviado**, o que é uma evidência bem mais forte do que a plausibilidade: o OCR lê CPF, nº de
registro e datas com 99–100% de precisão no dataset de validação.

Mas o OCR nem sempre lê (cobertura de 76–84% por campo forte na CNH antiga, nenhuma amostra da CNH
física nova, um único exemplo da digital). Sem OCR suficiente é preciso continuar valendo a análise
de plausibilidade que já existia.

## Decisão

**Um índice de veracidade (0–100)** por CNH, guardado em `OperatorLicense.veracity_score`, que
combina duas fontes de evidência por média ponderada:

- **plausibilidade** (a de antes: regras duras + classificador de ML);
- **consistência com a foto** (`ml/cnh_data/lib/consistency.py`): campo a campo, sem ML, com peso por
  campo conforme a precisão medida do OCR (CPF, nº de registro e datas = 1,0; UF, categoria, RG e
  nome = 0,5, os três últimos só se o OCR não os marcou como incertos; filiação e local = 0,25).

O peso do OCR cresce com a quantidade de evidência que ele trouxe (`w = min(1, evidência / 3)`) e é
zero abaixo de um campo forte. **O fallback é, portanto, o mesmo cálculo com `w = 0`**: sem foto,
sem OCR ou com pouco OCR, o índice é exatamente a plausibilidade, sem ramo de código separado.

**Recusa** quando uma regra dura dispara (o OCR bater não a anula: é um fato, não uma
probabilidade), ou quando há **divergência dura** com o OCR (o CPF diverge, ou duas divergências em
campos fortes), ou quando a nota combinada chega ao limiar de 0,60. Uma divergência isolada em um
campo forte não recusa sozinha, para tolerar digitação.

**O servidor roda o OCR de novo no arquivo salvo** em `MEDIA_ROOT/documents/`, a cada salvamento e
edição. O cliente não pode forjar o resultado (ele poderia mandar um OCR que bate com dados falsos),
e `file_url`, que vem do cliente, só vale se for um nome simples dentro dessa pasta. Falha do OCR,
layout não reconhecido ou arquivo ausente → o modelo avalia só a plausibilidade (fail-open, como
antes). O `cnh_data` continua sem importar o `cnh_image`: recebe o OCR como dado no stdin
(`{"record": ..., "ocr": ...}`), e o Django faz a ponte.

**Índice exposto na API** (`veracity_score` em `OperatorLicenseOutputSerializer`), gravado em `shadow`
e `enforce`; `off` não avalia nem roda o OCR. O dono da CNH vê só o motivo em `review_note`
("os dados informados não coincidem com o documento enviado" quando é a foto que contradiz, sem citar campos), nunca valores ou
pesos.

Os pesos, o limite de evidência e as regras de divergência foram **calibrados por simulação**
(`ml/cnh_data/scripts/evaluate_veracity.py`) sobre as leituras reais do OCR das fotos de validação do
BID, não treinados: não há cadastros falsos rotulados.

## Alternativas descartadas

- **O front reenviar os campos lidos pelo OCR.** Simples, mas forjável.
- **Guardar o resultado do `validate-document`** (cache por arquivo). Evita repetir o OCR (~3 s), mas
  exige uma tabela ou cache com CPF e nome lidos; adiado até a latência incomodar.
- **Treinar um combinador (regressão logística) com dados simulados.** Aprenderia o simulador, não a
  fraude real. A média ponderada com divergência dura é auditável e fácil de ajustar.
- **Contar campo não lido como divergência.** Puniria quem tem foto ruim ou CNH de layout não coberto.
- **Retreinar o classificador com a consistência como feature.** Os registros sintéticos não têm foto.

## Consequências

- Na simulação sobre 356 fotos de validação (limiar 0,60): 0% de cadastros honestos recusados (também
  com OCR parcial ou ausente, e com o modelo desconfiando), 0,8% quando um campo é digitado errado,
  100% quando o CPF ou duas informações vêm de outro documento, 99,7% para dados inventados. As
  divergências só são detectáveis onde o OCR leu o campo.
- **A simulação é otimista**: a digitação é perfeita, o dataset é sintético (fictício, ruidoso) e as
  datas dele são aleatórias, então as regras de datas foram deixadas de fora. Comece em `shadow`.
- **Consistência não é autenticidade**: foto de uma CNH alheia com os dados dessa mesma foto passa.
  Quem aceita o preenchimento automático do front também bate por construção.
- Cada salvamento ou edição com `file_url` paga um OCR (~3 s) além do modelo de dados (~1 s).
- Nova coluna `veracity_score` (migration `0009`). A API ainda não separa administrador de dono
  (pendência do ADR 0002), então o índice também aparece para o dono da CNH pela API.
- CNH digital e física nova: só entram se o OCR devolver campos; a nova nunca foi testada.

## Referências

- ADR [0002](0002-validacao-de-plausibilidade-dos-dados-da-cnh.md) e [0003](0003-ocr-da-cnh-no-modelo-de-imagem.md).
- `BackEnd/ml/cnh_data/README.md`: pesos, fórmula, contrato e a tabela da simulação.
- `BackEnd/ml/cnh_image/README.md`: precisão do OCR por campo, que sustenta os pesos.
