# ml — modelos de Machine Learning do Frota Rural

Dois modelos independentes validam o cadastro de CNH. Cada um mora no seu módulo, com código,
`models/` e README próprios. Eles só compartilham o ambiente virtual (`ml/venv`) e a pasta de
dados [`data/`](data/README.md).

| | [`cnh_image`](cnh_image/README.md) | [`cnh_data`](cnh_data/README.md) |
|---|---|---|
| **Pergunta** | O arquivo enviado é uma CNH? E o que está escrito nela (OCR)? | Os dados digitados são verdadeiros: conferem com a foto e parecem de verdade? (índice de veracidade 0–100) |
| **Entrada** | foto/PDF da CNH | JSON com os campos do cadastro (nome, datas, CPF, cidade...) e, se houver, o OCR do arquivo salvo |
| **Técnica** | CNN (MobileNetV2, TensorFlow) + OCR (RapidOCR) com parser por layout | consistência com o OCR + regras duras + `HistGradientBoosting` calibrado (scikit-learn) |
| **Quando roda** | ao escolher o arquivo no `CNHUpload.tsx` | ao salvar a CNH (`POST`/`PUT`/`PATCH /api/operator-licenses`) |
| **Efeito** | avisa o usuário e **preenche o formulário** com os campos lidos (CNH antiga e digital) | grava `veracity_score` e, se falso, a CNH como `rejected` com o motivo em `review_note` (o envio continua liberado) |
| **Se o modelo falha** | devolve `is_valid: false` + `error` | **nada é recusado**: o erro vira "não suspeito" (fail-open) |
| **Adaptador Django** | `document_validation/ml_adapters/cnh_image.py` | `document_validation/ml_adapters/cnh_data.py` |
| **Entrada do processo** | caminho do arquivo no `argv` | JSON no `stdin` (CPF e nomes não aparecem em `ps`) |

As fontes dos dados (IBGE, Base dos Dados e o dataset de imagens de documentos) estão em
[`data/README.md`](data/README.md#referências-de-onde-vêm-os-dados).

O código dos dois é independente (nenhum importa o outro), mas o **Django liga um ao outro** ao salvar a
CNH: roda o OCR do `cnh_image` no arquivo salvo e entrega o resultado ao `cnh_data` como dado, para
comparar a foto com o que foi digitado (índice de veracidade, [ADR 0004](../../Documentation/adr/0004-indice-de-veracidade-dados-x-ocr.md)).
Sem foto ou sem OCR, o `cnh_data` avalia só a plausibilidade dos dados.

## Estrutura

```
ml/
├── README.md              este arquivo
├── requirements.txt       dependências do venv de ML, compartilhado pelos dois modelos
├── venv/                  (ignorado) Python 3.13
├── data/                  dados compartilhados (CSV, JSON...), uma subpasta por conjunto → data/README.md
├── cnh_image/             modelo de imagem → cnh_image/README.md
│   ├── train.py  classify.py  models/        (rede neural + layout_antiga.json do OCR)
│   ├── lib/                   OCR: leitura, layouts, parsers, validadores
│   ├── scripts/               aprendem o layout e medem o OCR
│   └── tests/
└── cnh_data/              modelo de dados → cnh_data/README.md
    ├── train.py  classify.py  models/        (iguais ao cnh_image)
    ├── scripts/               preparam os dados que o train.py lê (IBGE e CSV sintético)
    ├── lib/                   código de apoio: regras, features, modelo, gerador
    └── tests/
```

Em cada modelo, os scripts do topo (`train.py`, `classify.py`) são os pontos de entrada, e o que
gera o modelo é sempre o `train.py`. Os scripts rodam direto (`python ml/cnh_data/classify.py`),
não como pacote; no `cnh_data`, o código de apoio fica em `lib/` e é importado como `from lib...`.

## Por que um venv separado

O TensorFlow não suporta o Python do Django (3.14), então o ML roda em um venv Python 3.13 e o
Django o chama por `subprocess`. No Docker, o interpretador fica em `/opt/ml-venv` e é apontado
pela variável `ML_PYTHON` (`compose.yaml`); sem containers, o padrão é `ml/venv/bin/python`.
Os dois adaptadores usam a mesma configuração, em `document_validation/ml_adapters/common.py`.

```bash
cd BackEnd/ml
python3.13 -m venv venv
./venv/bin/pip install -r requirements.txt
```

O `requirements.txt` fixa as versões. O modelo de dados (`.joblib`) é salvo com o scikit-learn
instalado: **trocar a versão dele exige retreinar** (`cnh_data/train.py`), e o `PlausibilityModel.load`
recusa um arquivo cujas features não batam com o código.

## Contrato com o Django

Ambos os scripts imprimem **uma linha JSON** no stdout e saem com código 0; erros de uso saem com
código 1 e um JSON `{"error": ...}`.

```jsonc
// cnh_image/classify.py <arquivo>
{"is_valid": true, "confidence": "high", "score": 0.9523,
 "document_type": "cnh_antiga", "fields": {"cpf": "..."}, "uncertain_fields": ["name"]}

// cnh_data/classify.py  ({"record": ..., "ocr": ...|null} no stdin)
{"is_suspicious": true, "score": 1.0, "veracity": 0, "basis": "plausibility",
 "reasons": ["CPF inválido"], "fields": ["números dos documentos"],
 "consistency": {"cpf": "absent", "...": "absent"}, "mismatch_fields": []}
```

## Testes

```bash
# adaptadores e integração no Django (o subprocess é simulado)
CHANNEL_LAYER_BACKEND=memory DJANGO_DEBUG=true venv/bin/python manage.py test document_validation

# módulos de ML (rodam no venv de ML)
./ml/venv/bin/python -m unittest discover -s ml/cnh_data/tests -t ml/cnh_data
./ml/venv/bin/python -m unittest discover -s ml/cnh_image/tests -t ml/cnh_image
```

## Adicionar um novo modelo

1. Crie `ml/<nome>/` com `train.py`, `classify.py` (uma linha JSON no stdout), `models/` e `README.md`.
   Se precisar de dados, use uma subpasta nova de `ml/data/` e documente-a lá (e no `.gitignore`).
2. Dependências novas vão em `ml/requirements.txt` (é o que o Dockerfile instala).
3. Crie `document_validation/ml_adapters/<nome>.py` reutilizando `common.py` (`ML_DIR`, `ML_PYTHON`),
   e reexporte a classe em `ml_adapters/__init__.py`.
4. Decida e documente a **política de falha**: o resultado só avisa (como `cnh_image`) ou muda o
   estado de um cadastro (como `cnh_data`, que por isso falha para o lado seguro)?
