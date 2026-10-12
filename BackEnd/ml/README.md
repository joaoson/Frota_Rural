# ml — modelos de Machine Learning do Frota Rural

Dois modelos independentes validam o cadastro de CNH. Cada um mora no seu módulo, com código,
`models/` e README próprios. Eles só compartilham o ambiente virtual (`ml/venv`) e a pasta de
dados [`data/`](data/README.md).

| | [`cnh_image`](cnh_image/README.md) | [`cnh_data`](cnh_data/README.md) |
|---|---|---|
| **Pergunta** | O arquivo enviado é uma CNH? | Os dados digitados parecem de verdade ou "só para enviar o formulário"? |
| **Entrada** | foto/PDF da CNH | JSON com os campos do cadastro (nome, datas, CPF, cidade...) |
| **Técnica** | CNN (MobileNetV2, TensorFlow) | regras duras + `HistGradientBoosting` calibrado (scikit-learn) |
| **Quando roda** | ao escolher o arquivo no `CNHUpload.tsx` | ao salvar a CNH (`POST`/`PUT`/`PATCH /api/operator-licenses`) |
| **Efeito** | só avisa o usuário na tela | grava a CNH como `rejected` com o motivo em `review_note` (o envio continua liberado) |
| **Se o modelo falha** | devolve `is_valid: false` + `error` | **nada é recusado**: o erro vira "não suspeito" (fail-open) |
| **Adaptador Django** | `document_validation/ml_adapters/cnh_image.py` | `document_validation/ml_adapters/cnh_data.py` |
| **Entrada do processo** | caminho do arquivo no `argv` | JSON no `stdin` (CPF e nomes não aparecem em `ps`) |

As fontes dos dados (IBGE, Base dos Dados e o dataset de imagens de documentos) estão em
[`data/README.md`](data/README.md#referências-de-onde-vêm-os-dados).

Os dois são independentes: um não usa a saída do outro. Cruzar a foto com os dados digitados (OCR)
é um passo futuro.

## Estrutura

```
ml/
├── README.md              este arquivo
├── requirements.txt       dependências do venv de ML, compartilhado pelos dois modelos
├── venv/                  (ignorado) Python 3.13
├── data/                  dados compartilhados (CSV, JSON...), uma subpasta por conjunto → data/README.md
├── cnh_image/             modelo de imagem → cnh_image/README.md
│   ├── train.py  classify.py  models/
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
{"is_valid": true, "confidence": "high", "score": 0.9523}

// cnh_data/classify.py  (registro no stdin)
{"is_suspicious": true, "confidence": "high", "score": 1.0,
 "reasons": ["CPF inválido"], "fields": ["números dos documentos"]}
```

## Testes

```bash
# adaptadores e integração no Django (o subprocess é simulado)
CHANNEL_LAYER_BACKEND=memory DJANGO_DEBUG=true venv/bin/python manage.py test document_validation

# módulo cnh_data (roda no venv de ML, que tem o scikit-learn)
./ml/venv/bin/python -m unittest discover -s ml/cnh_data/tests -t ml/cnh_data
```

## Adicionar um novo modelo

1. Crie `ml/<nome>/` com `train.py`, `classify.py` (uma linha JSON no stdout), `models/` e `README.md`.
   Se precisar de dados, use uma subpasta nova de `ml/data/` e documente-a lá (e no `.gitignore`).
2. Dependências novas vão em `ml/requirements.txt` (é o que o Dockerfile instala).
3. Crie `document_validation/ml_adapters/<nome>.py` reutilizando `common.py` (`ML_DIR`, `ML_PYTHON`),
   e reexporte a classe em `ml_adapters/__init__.py`.
4. Decida e documente a **política de falha**: o resultado só avisa (como `cnh_image`) ou muda o
   estado de um cadastro (como `cnh_data`, que por isso falha para o lado seguro)?
