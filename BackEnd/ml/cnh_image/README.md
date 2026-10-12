# cnh_image — o documento enviado é uma CNH?

Classificador de **imagem** (TensorFlow/Keras, transfer learning com MobileNetV2) que diz se
o arquivo enviado pelo usuário é uma CNH. É consultivo: o `CNHUpload.tsx` chama a API assim
que o arquivo é escolhido e mostra o resultado, mas ele não bloqueia o cadastro.

Para o modelo que avalia os **dados digitados** no formulário, veja [`../cnh_data`](../cnh_data/README.md).
A visão geral dos dois modelos está em [`../README.md`](../README.md).

## Arquivos

```
cnh_image/
├── train.py                    treino (lê ../data/cnh e ../data/not_cnh)
├── classify.py                 inferência (chamada pelo Django via subprocess)
└── models/cnh_classifier.keras modelo treinado (versionado)
```

Adaptador no Django: `document_validation/ml_adapters/cnh_image.py` (`CnhClassifier`).
Endpoint: `POST /api/operator-licenses/validate-document` (multipart, campo `file`).

## Preparar o dataset

As imagens ficam na pasta de dados compartilhada, **fora do git** (`ml/data/**` é ignorada):

```
ml/data/cnh/        ← fotos/scans de CNH (formato antigo ou novo)
ml/data/not_cnh/    ← fotos aleatórias, selfies, outros documentos
```

- Datasets usados: [Brazilian-Identity-Document-Dataset](https://github.com/ricardobnjunior/Brazilian-Identity-Document-Dataset) (GitHub) para as CNHs e
  [Natural Images (Kaggle)](https://www.kaggle.com/datasets/prasunroy/natural-images) para a
  classe `not_cnh`. Referências completas em [`../data/README.md`](../data/README.md#referências-de-onde-vêm-os-dados).
- Formatos aceitos: `.jpg`, `.png`, `.jpeg`. As duas pastas devem ter quantidades parecidas.
- As demais subpastas de `ml/data/` (`names`, `cities`, `synth`...) **não** são lidas por este
  modelo: o treino fixa `class_names=["cnh", "not_cnh"]` (mantendo `cnh=0`, `not_cnh=1`).

## Treinar

```bash
cd BackEnd
./ml/venv/bin/python ml/cnh_image/train.py
```

O script:

1. Carrega as imagens de `ml/data/cnh/` e `ml/data/not_cnh/` (80% treino, 20% validação).
2. Aplica data augmentation (rotação, zoom, brilho, contraste).
3. Usa a MobileNetV2 pré-treinada (congelada) como base, com `GlobalAveragePooling2D`,
   `Dropout(0.3)` e `Dense(1, sigmoid)`.
4. Treina por até 30 épocas com early stopping (paciência 5 em `val_accuracy`).
5. Salva o melhor modelo em `ml/cnh_image/models/cnh_classifier.keras`.

Saída esperada: acurácia de validação ≥ 85%.

> **macOS — erro de SSL ao treinar:** se aparecer `SSL: CERTIFICATE_VERIFY_FAILED`, rode
> `/Applications/Python\ 3.13/Install\ Certificates.command` (necessário para baixar os pesos
> da MobileNetV2).

## Testar a inferência manualmente

```bash
./ml/venv/bin/python ml/cnh_image/classify.py /caminho/para/imagem.jpg
./ml/venv/bin/python ml/cnh_image/classify.py /caminho/para/cnh.pdf   # usa a 1ª página
```

Saída (uma linha JSON):

```json
{"is_valid": true, "confidence": "high", "score": 0.9523}
```

- `score` é a probabilidade de ser CNH (`1 - saída do modelo`, já que `cnh=0`).
- `confidence`: `high` ≥ 0,85, `medium` ≥ 0,5, `low` abaixo. `is_valid` é `score ≥ 0,5`.
- Se o modelo não existir, o JSON traz também `error`.

## Política de falha

Se o motor falhar (processo com erro, timeout de 30 s, saída inválida), o adaptador devolve
`is_valid: false` com `error`. Como o resultado é só um aviso na tela, isso é aceitável aqui.
(O modelo de dados faz o contrário, de propósito: ver `../cnh_data/README.md`.)
