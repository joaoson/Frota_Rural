# cnh_image — o documento é uma CNH? E o que está escrito nele?

Modelo de **imagem** com duas partes que rodam juntas no mesmo processo:

1. **Classificador** (TensorFlow/Keras, MobileNetV2): diz se o arquivo é uma CNH.
2. **Leitor OCR** (RapidOCR + um parser por layout): lê os campos da CNH **antiga** e da
   **digital** e devolve tudo que conseguiu validar, para o `CNHUpload.tsx` preencher o formulário.

O resultado é consultivo: nada aqui bloqueia o cadastro. Para o modelo que avalia os **dados
digitados**, veja [`../cnh_data`](../cnh_data/README.md); a visão geral está em [`../README.md`](../README.md).

## Os três tipos de CNH

| Tipo | O que acontece |
|---|---|
| **Física antiga** (aberta; é o que o dataset cobre) | OCR lê os campos, e o front preenche o formulário. |
| **Física nova** | Provavelmente o OCR não acha o layout: `document_type = "desconhecido"` e vale só o veredito da rede neural (sem campos). **Não há amostras para testar**: este caminho não foi medido. |
| **Digital** (CNH-e, PDF do gov.br) | Layout numerado + MRZ. O OCR tenta, e o resultado foi conferido em um exemplo (ver "Limites"). |

O tipo **não** vem de um terceiro classificador: vem da evidência do OCR (quantos rótulos de cada
layout apareceram). Se nenhum layout aparece, é `desconhecido`.

## Arquivos

```
cnh_image/
├── train.py                       ◄ GERA O MODELO (rede neural) → models/cnh_classifier.keras
├── classify.py                    ◄ USA: rede neural + OCR → uma linha JSON
├── models/
│   ├── cnh_classifier.keras       rede treinada (versionada)
│   └── layout_antiga.json         posição dos rótulos e dos campos da CNH antiga (versionado)
├── lib/                           código de apoio do OCR
│   ├── reader.py                  ponto de entrada: arquivo → tipo + campos
│   ├── source.py                  arquivo → imagens (JPG/PNG; PDF → imagens embutidas)
│   ├── ocr.py                     RapidOCR (import tardio; leitura de linhas e de recortes)
│   ├── layouts.py                 rótulos de cada layout e busca tolerante a erro de OCR
│   ├── registration.py            endireita o documento (rotação, escala, translação)
│   ├── parse_antiga.py            parser da CNH antiga (janelas aprendidas + votação)
│   ├── parse_digital.py           parser da CNH digital (rótulo numerado → linha abaixo)
│   ├── mrz.py                     zona legível por máquina (ICAO TD1) da digital
│   ├── validators.py              CPF, datas, UF, categoria, RG, nome
│   ├── text.py                    normalização e similaridade de texto
│   └── groundtruth.py             lê o gt_ocr do dataset (usado por treino e scripts)
├── scripts/
│   ├── learn_layout.py            ◄ GERA models/layout_antiga.json a partir do dataset
│   ├── export_readings.py          exporta o OCR das fotos de validação (ponte para cnh_data/scripts/evaluate_veracity.py)
│   ├── evaluate_ocr.py            mede o OCR (cobertura/precisão por campo)
│   └── export_readings.py         exporta o OCR das fotos de validação para calibrar o cnh_data
└── tests/                         unittest
```

Adaptador no Django: `document_validation/ml_adapters/cnh_image.py` (`CnhClassifier`).
Endpoint: `POST /api/operator-licenses/validate-document` (multipart, campo `file`).

## Como o OCR funciona

```
arquivo ─► rede neural ───────────────────────────────────────────► score
   │
   └─► source.py: imagem (PDF → imagens embutidas via `pdfimages`)
       ─► ocr.py: linhas de texto com caixa e confiança
       ─► layouts.py: quais rótulos de cada layout aparecem? (tolera acento/ruído)
            ├─ CNH antiga:  registration.py acha a transformação (rotação/escala/translação)
            │               e parse_antiga.py lê cada campo na janela aprendida do rótulo
            ├─ CNH digital: parse_digital.py pega a linha logo abaixo de cada rótulo numerado;
            │               mrz.py corrige nome e datas com os dígitos verificadores
            └─ nenhum:      desconhecido, sem campos
       ─► validators.py: só sai o campo que passa na validação
```

**CNH antiga.** O dataset tem 43% das fotos giradas em 90°/270°, além de escala e inclinação
variadas. Em vez de testar as quatro orientações, `registration.py` casa os rótulos achados
(NOME, CPF, VALIDADE...) com as posições do modelo e estima uma transformação de similaridade
com RANSAC; assim qualquer ângulo funciona. Os campos são lidos em janelas relativas ao rótulo,
aprendidas do ground truth (`scripts/learn_layout.py`, só com os documentos de treino). Nome, RG
e categoria são os campos mais ruidosos: eles são lidos várias vezes (a detecção geral e três
recortes deslocados na vertical) e o valor sai por **votação**.

**CNH digital.** Os rótulos são numerados ("4d CPF", "5 Nº REGISTRO"...) e o valor é a linha
mais próxima abaixo do rótulo. O PDF tem os dados em imagens embutidas, não em texto. A MRZ
corrige o espaçamento do nome e as datas, e o que bate com os dígitos verificadores ganha
prioridade. A digital traz a **naturalidade** (cidade e UF), que a antiga não tem.

### Princípios

- **Precisão acima de cobertura.** Um campo só é devolvido se passar na validação (CPF com dígitos
  verificadores, datas reais, UF existente, categoria no conjunto válido...). Dado errado no
  formulário é pior do que campo vazio.
- **Incerteza explícita.** Nome, RG e categoria que não tiveram votos suficientes voltam em
  `uncertain_fields`, e o front avisa "confira antes de enviar".
- **O OCR nunca derruba a validação.** Se o RapidOCR faltar, estourar o tempo ou der erro, volta
  o resultado da rede neural com `fields: null`.
- **Nada de valores em log.** Só o tipo da exceção vai para o stderr.

## Contrato

`classify.py` imprime uma linha JSON (os três primeiros campos já existiam):

```jsonc
{"is_valid": true, "confidence": "medium", "score": 0.3471,
 "document_type": "cnh_digital",              // cnh_antiga | cnh_digital | desconhecido
 "fields": {"name": "...", "cpf": "...", "birth_date": "1990-01-31", ...},   // ou null
 "uncertain_fields": ["rg"]}
```

- `score` e `confidence` vêm **sempre** da rede neural (`high` ≥ 0,85; `medium` ≥ 0,5; `low`).
- `is_valid` é verdadeiro se a rede aprovar (score ≥ 0,5) **ou** se o OCR achar o layout e ao menos
  4 campos válidos (`MIN_FIELDS_TO_PROMOTE`). Nesse caso `confidence` fica `medium` e o `score`
  continua baixo. A rede só foi treinada com a CNH antiga e rejeita, por exemplo, a digital.
- `fields` usa as chaves do `POST /api/operator-licenses` (`name`, `birth_date`, `cpf`, `rg`,
  `father_name`, `mother_name`, `nationality`, `birth_place`, `cnh_number`, `category`,
  `first_license_date`, `issue_date`, `expiration_date`, `issuing_state`, `issuing_authority`,
  `observations`, `ear`). Só traz o que foi lido; **não** traz `situation`, `points`, `acc`
  nem `medical_restrictions`.
- FILIAÇÃO: o primeiro nome é o **pai**, o segundo a **mãe**. Só devolve se houver exatamente dois nomes.
- Variável de ambiente `CNH_OCR=0` desliga o OCR. Em imagens (não PDF) com score da rede abaixo de
  0,15 o OCR é pulado.

O Django repassa `document_type`, `fields` e `uncertain_fields` em `CnhValidationOutputSerializer`.
O front (`CNHUpload.tsx`) preenche os campos com máscara, aceita edição e mostra "CNH {antiga|digital}
reconhecida. Preenchemos N campos...". Ao trocar de arquivo, os campos preenchidos antes pelo OCR
são limpos.

## Qualidade (CNH antiga, dataset BID, validação por documento)

`scripts/evaluate_ocr.py`, 418 fotos dos documentos de validação (nunca vistos pelo
aprendizado do layout). Layout antigo reconhecido em **85,2%** das fotos.

| Campo | Cobertura | Precisão | Só os "confiáveis" (sem `uncertain`) |
|---|---|---|---|
| CPF | 77,8% | 100% | igual |
| Nascimento / emissão / validade / 1ª habilitação | 76–84% | 100% | igual |
| Nº de registro | 84,0% | 99,1% | igual |
| UF emissora | 79,7% | 99,1% | igual |
| Categoria | 54,9% | 99,6% | 26,9% de cobertura, 100% |
| RG | 77,3% | 90,2% | 21,2% de cobertura, 96,6% |
| Nome | 37,6% | 77,1% | 11,3% de cobertura, 91,5% |

Latência do OCR: mediana 0,57 s e p95 0,71 s por foto; `classify.py` completo (carga do TensorFlow
inclusa) leva ~3 s.

- O objetivo era precisão ≥ 95% nos campos devolvidos. **Vale para os campos tipados** (CPF,
  datas, nº de registro, UF, categoria). **Não vale para nome e RG**: as fotos do dataset são muito
  ruidosas (a meta só se aproxima nos "confiáveis"). Em vez de esconder, eles voltam marcados em
  `uncertain_fields`. Parte dos "erros" do RG vem de ruído no próprio ground truth.
- As datas do dataset são aleatórias (pessoas fictícias): o leitor só confere que cada data seja
  real, não a coerência entre elas. Isso fica para o `cnh_data`.

## Limites conhecidos

- **O dataset é sintético** (documentos fictícios fotografados): fotos reais de celular podem render menos.
- **CNH física nova: sem amostra.** Cai em `desconhecido` e só vale a rede neural.
- **CNH digital: um único exemplo** (`ml/data/cnh_digital/CNH-e.pdf`) calibrou o layout. Funcionou, e
  o RG saiu distinto do CPF, mas isso não é medida estatística.
- **Pai × mãe** na FILIAÇÃO é heurística (linhas de até 12 caracteres continuam o nome anterior,
  calibrado no BID) e assume a ordem pai, mãe.
- Em foto muito ruim o layout pode não ser reconhecido (14,8% no BID); então `desconhecido` e só a rede neural decide.

## Privacidade

O OCR extrai nome, CPF e filiação. Os valores só trafegam na resposta da API: **não vão para log**.
O PDF de exemplo parece um documento pessoal real; fica em `ml/data/cnh_digital/` (ignorada pelo
git) e **nenhum valor dele aparece em testes, documentação ou commits**: os testes com esse arquivo
(`tests/test_real_data.py`, `CnhOcrEndToEndTests`) só conferem estrutura e são pulados se ele não existir.

## Preparar o dataset

As imagens ficam na pasta de dados compartilhada, **fora do git** (`ml/data/**` é ignorada):

```
ml/data/cnh/          ← *_in.jpg (foto), *_gt_ocr.txt (texto e caixas), *_gt_segmentation.jpg (máscara de texto)
ml/data/cnh_digital/  ← CNH digital de exemplo (PDF)
ml/data/not_cnh/      ← fotos aleatórias, selfies, outros documentos
```

- Datasets: [Brazilian-Identity-Document-Dataset](https://github.com/ricardobnjunior/Brazilian-Identity-Document-Dataset)
  (BID, GitHub) para as CNHs e [Natural Images (Kaggle)](https://www.kaggle.com/datasets/prasunroy/natural-images)
  para `not_cnh`. Referências em [`../data/README.md`](../data/README.md#referências-de-onde-vêm-os-dados).
- O dataset tem ~3 fotos de cada documento. **Treino e avaliação separam por documento**
  (`lib/groundtruth.is_validation`, hash do conteúdo; 25% validação), senão a nota seria inflada.
- Só os `*_in.jpg` entram no treino da rede; o `_gt_segmentation.jpg` (máscara) não é CNH.

## Comandos

```bash
cd BackEnd
# treinar a rede neural (salva em models/cnh_classifier.keras; --output para outro caminho)
./ml/venv/bin/python ml/cnh_image/train.py

# reaprender o layout da CNH antiga a partir do ground truth (gera models/layout_antiga.json)
./ml/venv/bin/python ml/cnh_image/scripts/learn_layout.py

# exportar o OCR das fotos de validação (alimenta ml/cnh_data/scripts/evaluate_veracity.py)
./ml/venv/bin/python ml/cnh_image/scripts/export_readings.py

# medir o OCR (cobertura/precisão por campo, latência)
./ml/venv/bin/python ml/cnh_image/scripts/evaluate_ocr.py [--limit N] [--show-errors]

# inferência manual
./ml/venv/bin/python ml/cnh_image/classify.py /caminho/para/imagem.jpg
./ml/venv/bin/python ml/cnh_image/classify.py /caminho/para/cnh.pdf

# testes
./ml/venv/bin/python -m unittest discover -s ml/cnh_image/tests -t ml/cnh_image
```

`train.py`: MobileNetV2 congelada + `GlobalAveragePooling2D` + `Dropout(0.3)` + `Dense(1, sigmoid)`,
com data augmentation e early stopping (paciência 5 em `val_accuracy`). Rótulos `cnh=0`, `not_cnh=1`.
A última execução (validação por documento) teve 100% de acurácia, então o `.keras` versionado não
foi trocado. O OCR **não** depende dele.

> **macOS — erro de SSL ao treinar:** se aparecer `SSL: CERTIFICATE_VERIFY_FAILED`, rode
> `/Applications/Python\ 3.13/Install\ Certificates.command` (para baixar os pesos da MobileNetV2).

Dependências do OCR (em `../requirements.txt`): `rapidocr-onnxruntime`, `onnxruntime`,
`opencv-python`. No Docker o OpenCV exige `libgl1` e `libglib2.0-0` (já no Dockerfile).

## Política de falha

Se o processo falhar (erro, timeout de 60 s, saída inválida), o adaptador devolve `is_valid: false`
com `error`. Como o resultado é só um aviso na tela, isso é aceitável. Falha **só do OCR** é
mais branda: o resultado da rede neural volta normalmente, com `fields: null`.
(O modelo de dados faz o contrário, de propósito: ver `../cnh_data/README.md`.)
