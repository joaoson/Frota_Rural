# data — dados compartilhados pelos modelos de ML

Uma subpasta por conjunto de dados. O `.gitignore` ignora `ml/data/**` e abre exceção só
para o que o modelo precisa **em runtime** (e no build do Docker, que copia `BackEnd/`).

| Subpasta | Conteúdo | Versionada | Quem usa |
|---|---|---|---|
| `cnh/` | fotos/scans de CNH | não | `cnh_image/train.py` |
| `not_cnh/` | imagens que não são CNH | não | `cnh_image/train.py` |
| `names/` | `first_names.tsv`: primeiros nomes e nº de nascimentos (IBGE) | **sim** | `cnh_data` (treino e inferência) |
| `cities/` | `cities.json`: municípios por UF (IBGE) | **sim** | `cnh_data` (treino e inferência) |
| `lexicon/` | `lexicon.csv`: listas de palavras escritas à mão (sobrenomes, palavras comuns, "teste"...) | **sim** | `cnh_data/lib/synthetic.py` |
| `eval/` | `adversarial_cases.json`: 37 casos escritos à mão para avaliar o modelo | **sim** | `cnh_data/train.py` |
| `synth/` | `cnh_records.csv`: o **dataset sintético** (24.000 plausíveis + 20.000 falsos, ~10 MB) | não (regenerável) | `cnh_data/train.py` |
| `raw/` | CSVs brutos do IBGE (~35 MB) | não | `cnh_data/scripts/build_reference_data.py` |

> Os arquivos versionados são pequenos (≈ 370 KB e ≈ 120 KB). Se `names/` ou `cities/` sumirem,
> o modelo de dados não falha: o adaptador do Django o trata como indisponível e **nada é
> recusado** (ver "Política de falha" em `cnh_data/README.md`). Por isso eles precisam estar no git.

## names/ e cities/ — bases do IBGE

**Origem:** Censo 2010 do IBGE, distribuído pelo [Base dos Dados](https://basedosdados.org).
Os CSVs brutos são:

- `br_ibge_nomes_brasil_quantidade_municipio_nome_2010.csv`: `id_municipio, nome, quantidade_nascimentos_ate_2010`
  (1.959.116 linhas, 33.076 primeiros nomes, 144,97 milhões de nascimentos).
  Só **primeiros nomes** (sem sobrenomes) e só nomes com ao menos 10 ocorrências por município.
- `br_bd_diretorios_brasil_municipio.csv`: diretório de municípios (5.571 linhas, 27 UFs) com
  várias colunas; usamos apenas `id_municipio`, `nome` e `sigla_uf`.

**Como regenerar** (coloque os dois CSVs em `ml/data/raw/`):

```bash
cd BackEnd
./ml/venv/bin/python ml/cnh_data/scripts/build_reference_data.py
```

**O que sai:**

- `names/first_names.tsv`: `nome_normalizado<TAB>quantidade`, do mais ao menos frequente,
  somando todos os municípios (33.075 nomes). A linha com nome corrompido (`?`) é descartada.
- `cities/cities.json`: `{UF: {cidade_normalizada: peso}}`, com 5.571 municípios. O `peso` é o
  total de nascimentos do município na base de nomes (um proxy de população) e só serve para o
  gerador de dados sintéticos sortear cidades de forma realista.
- Ficam de fora: região metropolitana, DDD, centroide, comarca e as demais colunas do diretório.

**Normalização** (`cnh_data/lib/reference.py::normalize_text`): minúsculo, sem acento e qualquer
pontuação vira espaço. É necessária porque os nomes do IBGE vêm sem acento (`Jose`) e os
municípios com acento (`Guajará-Mirim`, `Machadinho D'Oeste`).

**Armadilha conhecida:** 233 nomes de município se repetem entre UFs (`Buritis` existe em RO
e em MG). A chave de busca é sempre o par (UF, cidade).

**Limites:** a base não tem sobrenomes, não tem nascidos depois de 2010 (quem tem CNH hoje nasceu
até 2008, então a cobertura é boa) e não tem nomes muito raros. Por isso a ausência de um nome
na base é só um sinal fraco para o modelo, nunca um motivo de recusa por si só.

## lexicon/ — listas de palavras do gerador sintético

`lexicon.csv` tem as colunas `kind,value,extra`. É onde se edita o que antes ficava dentro do
código Python:

| `kind` | Para que serve |
|---|---|
| `surname` | sobrenomes brasileiros (inclui alemães, italianos, japoneses e árabes comuns no Brasil) |
| `rare_first_name` | prenomes raros ou estrangeiros que aparecem em cadastros **legítimos** |
| `district` | localidades legítimas que não são município (`value` = nome, `extra` = UF) |
| `foreign_city` | cidades de nascimento de estrangeiros |
| `medical_note`, `observation` | textos livres plausíveis dos campos opcionais |
| `common_word` | palavras comuns usadas como "lixo realista" no lugar do nome |
| `placeholder_name`, `placeholder_parent` | `Teste`, `Fulano de Tal`, `Mae`... |

Depois de editar, regenere o CSV sintético e retreine (`cnh_data/README.md`).

## synth/cnh_records.csv — o dataset sintético

Uma linha por registro de CNH. Colunas: os 21 campos do cadastro (`name`, `birth_date`, `cpf`,
`rg`, `mother_name`, `father_name`, `nationality`, `birth_place`, `cnh_number`, `category`,
`first_license_date`, `issue_date`, `expiration_date`, `issuing_state`, `issuing_authority`,
`situation`, `acc`, `ear`, `medical_restrictions`, `observations`, `points`), mais:

- `label`: `1` = dado falso, `0` = plausível.
- `families`: famílias de lixo aplicadas, separadas por `;` (vazio nos plausíveis).

É gerado de forma determinística (semente 42) por `cnh_data/scripts/generate_synthetic_data.py`
a partir das bases do IBGE e do `lexicon.csv`, e o `cnh_data/train.py` o gera sozinho se faltar.
Pode ser aberto numa planilha para inspecionar. Contém só dados inventados, nenhum dado pessoal.
