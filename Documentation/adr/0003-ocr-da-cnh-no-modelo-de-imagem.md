# ADR 0003: Leitura da CNH por OCR no modelo de imagem

**Status:** Aceito
**Data:** 2026-10-12

## Contexto

O `ml/cnh_image` só dizia se o arquivo era uma CNH, e o usuário digitava os 20+ campos à mão
no `CNHUpload.tsx`. Queríamos ler o documento e preencher o formulário sozinho (editável).

Há três modelos de CNH, e só um tem dados:

- **Física antiga**: o dataset BID (`ml/data/cnh/`) tem foto + texto de cada documento (593
  documentos fictícios, ~3 fotos cada, 43% giradas em 90°/270°).
- **Física nova**: nenhuma amostra.
- **Digital** (CNH-e, PDF): um único exemplo, que é um documento pessoal real.

Restrições: o envio continua livre (o OCR só ajuda); dado errado no formulário é pior do que
campo vazio; valores lidos (CPF, nome, filiação) são dados pessoais.

## Decisão

**Motor pronto, não modelo próprio.** Usar o RapidOCR (PP-OCR em `onnxruntime`, modelos embutidos,
sem PyTorch) e escrever um **parser por layout** por cima. O dataset serve para aprender a posição
dos campos e para medir, não para treinar um OCR. Treinar um reconhecedor com 593 documentos
sintéticos ficaria pior que um motor pronto e criaria um modelo a manter.

**O tipo do documento vem da evidência do OCR**, não de um terceiro classificador: se os rótulos
de um layout aparecem, é esse layout (`cnh_antiga`, `cnh_digital`); senão, `desconhecido`.
Sem exemplos da CNH física nova não há como treinar um classificador para ela; o caminho dela é
cair em `desconhecido` e valer só a rede neural.

**Registro geométrico em vez de testar orientações.** Os rótulos achados são casados com o modelo
da CNH antiga (similaridade + RANSAC), o que resolve rotação, escala e deslocamento de uma vez,
e os campos são lidos em janelas relativas aos rótulos, aprendidas só com os documentos de
treino (`models/layout_antiga.json`, versionado). Na digital, o valor é a linha abaixo do rótulo
numerado, e a MRZ (ICAO TD1) corrige nome e datas.

**Precisão acima de cobertura.** Cada campo passa por validação (CPF com dígito verificador, datas
reais, UF, categoria...) e só sai se passar. Nome, RG e categoria são lidos por votação entre
várias leituras; os que não atingem o número de votos confiável voltam em `uncertain_fields`
e o front pede para conferir.

**O OCR promove `is_valid`.** A rede neural só foi treinada com a CNH antiga e rejeita a digital
(nota 0,35). Se o OCR achar o layout com ao menos 4 campos válidos, `is_valid` fica verdadeiro com
`confidence = medium`; `score` continua sendo o da rede.

**Fail-soft.** Sem RapidOCR, com timeout ou erro, o resultado da rede volta com `fields: null`.
`CNH_OCR=0` desliga o OCR. Imagens com nota da rede < 0,15 não gastam OCR.

**Contrato.** `document_type`, `fields` (chaves do `POST /operator-licenses`) e `uncertain_fields`
são acrescentados à resposta; os campos antigos não mudam. O timeout do adaptador subiu de 30 s
para 60 s.

## Alternativas descartadas

- **Tesseract.** Exige instalar um binário no sistema e o suporte a fotos giradas/ruidosas é pior;
  o RapidOCR é um pacote pip com modelos embutidos.
- **OCR treinado com o dataset.** Pouco dado, domínio sintético, e manutenção de mais um modelo.
- **Terceiro classificador (antiga × nova × digital).** Sem amostras da nova nem da digital.
- **Testar as quatro orientações.** Mais lento e não cobre ângulos arbitrários.
- **Devolver tudo que foi lido, mesmo duvidoso.** Preencheria o formulário com dado errado sem aviso.

## Consequências

- Medido no BID (418 fotos de documentos de validação, separadas por documento): layout antigo
  reconhecido em 85,2%; CPF, datas, nº de registro, UF e categoria com 99–100% de precisão e
  cobertura de 55–84%; RG 90,2% e nome 77,1% de precisão (96,6% e 91,5% quando só os "confiáveis").
  Nome e RG **não** atingem a meta de 95%, por isso são sinalizados como incertos. OCR mediano
  de 0,57 s por foto; `classify.py` completo ~3 s.
- **Os números são de um dataset sintético**; fotos reais podem ter desempenho pior.
- **A CNH física nova nunca foi testada**, e a digital foi calibrada com um único exemplo.
  A separação pai × mãe na FILIAÇÃO é heurística.
- Novas dependências: `rapidocr-onnxruntime`, `onnxruntime`, `opencv-python` (e `libgl1`,
  `libglib2.0-0` no Docker). A imagem do backend fica maior.
- **Privacidade**: valores lidos trafegam só na resposta da API; não vão para log. O PDF de exemplo
  fica fora do git e nenhum valor dele aparece em testes ou documentação.
- Retreinar a rede não é necessário para melhorar o OCR; o layout é reaprendido com
  `ml/cnh_image/scripts/learn_layout.py` e medido com `evaluate_ocr.py`.

## Referências

- [Brazilian-Identity-Document-Dataset](https://github.com/ricardobnjunior/Brazilian-Identity-Document-Dataset): imagens e texto (ground truth) da CNH antiga.
- [RapidOCR](https://github.com/RapidAI/RapidOCR): motor de OCR.
- Detalhes do pipeline e da avaliação: `BackEnd/ml/cnh_image/README.md`.
