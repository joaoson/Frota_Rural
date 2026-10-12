# ADR 0002: Validação de plausibilidade dos dados da CNH com ML

**Status:** Aceito
**Data:** 2026-10-12

## Contexto

O cadastro de CNH (`CNHUpload.tsx`) já tinha um classificador de **imagem** que avisa se o
arquivo enviado parece uma CNH, mas nada olhava para os **dados digitados**. Quem só queria
enviar o formulário podia preencher nomes como "asdf", datas incoerentes ou um nº de CNH
`11111111111`, e o cadastro entrava como `pending` para um administrador revisar à mão.

O backend também não validava nada além de tipo e tamanho (CPF, ordem das datas, formato
do número da CNH): essas checagens existem só no Zod do front, então a API aceitava qualquer
coisa vinda de fora do formulário.

Restrições do problema:

- O envio não pode ser bloqueado: o cadastro é gravado e, se os dados parecerem falsos,
  já nasce `rejected` com o motivo (o dashboard do locador já exibe `review_note`).
- Não existe base de cadastros falsos rotulados, e dados de fraude desse tipo não são públicos.
- Recusar por engano um usuário legítimo é pior do que deixar passar um dado falso.

## Decisão

Criar um segundo modelo, `ml/cnh_data`, **separado** do modelo de imagem (`ml/cnh_image`), com
a mesma estrutura (script de treino, script de inferência, `models/` e adaptador Django por
subprocess) e dados compartilhados em `ml/data/`.

**Duas camadas** no mesmo script de inferência:

1. **Regras duras** (`lib/rules.py`): fatos verificáveis, com motivo exato (validade anterior à
   emissão, CPF com dígito verificador errado, nº de CNH sequencial, placeholders como "teste").
2. **Classificador de ML** (`HistGradientBoostingClassifier` calibrado): estima a probabilidade
   de o registro ser falso a partir de *features* derivadas (qualidade do texto dos nomes,
   frequência do nome e existência da cidade na UF segundo o IBGE, coerência das datas e dos
   números). Um `IsolationForest` treinado só com registros plausíveis dá uma nota de anomalia
   para pegar lixo que nenhum exemplo falso previu.

**Dados de treino sintéticos**, gerados a partir de dados reais do IBGE (nomes pela frequência
do Censo 2010, municípios por UF), com famílias de lixo ("teclado", "palavras comuns",
"datas invertidas"...) para os exemplos falsos. O dataset é um CSV em `ml/data/synth/`, e as
listas de palavras do gerador ficam em `ml/data/lexicon/`, não no código.

**Integração** (`OperatorLicenseService.create`/`update`): a CNH é gravada como `pending`; em
seguida o modelo avalia e, se suspeita, ela é regravada como `rejected` com `review_note` e
`auto_rejected = true`. Como `update` zera o status a cada edição, ele também reavalia. O
campo `auto_rejected` distingue a recusa do modelo da de um administrador (uma decisão humana
o zera), para que um retreino futuro não trate a saída do próprio modelo como verdade.

**Política agressiva**: recusa a partir de 60% de probabilidade (`ML_PLAUSIBILITY_THRESHOLD`).
`ML_PLAUSIBILITY_MODE` (`off`, `shadow`, `enforce`) permite medir antes de recusar.

**Falha para o lado seguro (fail-open)**: se o modelo ou as bases não existirem, ou o processo
falhar, o adaptador devolve "não suspeito" e registra em log. É o oposto do classificador de
imagem (que devolve `is_valid: false`), de propósito: aquele só avisa na tela, este muda o
estado de um cadastro.

**Privacidade**: o registro vai ao subprocess pelo `stdin` (CPF e nomes não aparecem em `ps`),
o log não contém dados pessoais e o modelo vê só features numéricas.

## Alternativas descartadas

- **Só regras.** Pega o óbvio, mas não "palavras comuns no lugar do nome", teclas vizinhas ou
  cidade sem sentido, e vira uma lista infinita de exceções.
- **Rede neural/LLM sobre o texto cru.** Exige muito mais dados rotulados que não existem, é
  menos explicável e mais difícil de auditar do que features + gradient boosting.
- **Rodar em processo no Django.** Mais rápido (sem processo por cadastro), mas o ML tem um venv
  próprio (o TensorFlow não suporta o Python do Django) e o padrão do projeto já é o subprocess.
- **Nome fora da base ou cidade fora da UF como regra dura.** Recusaria pessoas legítimas com
  nomes raros, estrangeiros ou nascidas em distritos que não são município. Viram só features.
- **Bloquear o envio com erro 400.** Contraria a decisão de liberar o envio e registrar a recusa.

## Consequências

- Cadastros com dados claramente falsos deixam de depender de revisão manual para serem recusados,
  e o usuário vê o motivo (os campos suspeitos, nunca as regras nem o limiar) no dashboard.
- Cada salvamento de CNH paga um processo Python (~1 s de import do scikit-learn). Aceitável
  para um cadastro raro; se virar gargalo, o próximo passo é um processo residente.
- **Os números de treino são otimistas**: medem o quanto o modelo aprendeu o gerador. O limiar de 60%
  não foi calibrado com tráfego real. Recomenda-se um período em `shadow` antes do `enforce`.
- O modelo só julga **plausibilidade**, não autenticidade: um cadastro bem preenchido com dados de
  outra pessoa passa. Cruzar a foto (OCR) com os dados digitados é um passo futuro.
- O `.joblib` é acoplado à versão do scikit-learn (fixada em `ml/requirements.txt`); atualizá-la
  exige retreinar.
- O admin ainda pode aprovar uma CNH recusada automaticamente via `/review`. Esse endpoint hoje
  não tem checagem de permissão no backend (problema pré-existente, fora deste escopo).
- Com decisões reais de administradores acumuladas (e `auto_rejected = false`), o modelo pode ser
  retreinado com rótulos reais; o gerador sintético passa a ser só complemento.
