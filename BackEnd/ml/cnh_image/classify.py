"""Inferência do modelo de imagem de CNH: reconhece se é uma CNH e lê os campos por OCR.

Chamado pelo Django via subprocess (`document_validation/ml_adapters/cnh_image.py`): recebe o
caminho de uma imagem ou PDF e imprime uma linha JSON:

    {"is_valid", "confidence", "score",                        # rede neural (como sempre)
     "document_type": "cnh_antiga|cnh_digital|desconhecido",   # layout achado pelo OCR
     "fields": {...} | null,                                   # campos lidos e validados
     "uncertain_fields": [...]}                                # lidos com pouca certeza

- `score`/`confidence` são sempre da rede neural (MobileNetV2).
- `is_valid` é verdadeiro se a rede aprovar **ou** se o OCR achar o layout e campos suficientes
  e válidos (a rede só foi treinada com a CNH antiga e rejeita, por exemplo, a CNH digital).
- Um erro ou a falta do OCR nunca derruba a validação: voltam `fields: null` e o resultado da rede.
- Os valores dos campos nunca vão para o log.

Variável de ambiente opcional: CNH_OCR=0 desliga o OCR.

Uso: ./ml/venv/bin/python ml/cnh_image/classify.py <arquivo>
"""

import json
import os
import pathlib
import sys

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

import numpy as np
import tensorflow as tf
from PIL import Image

IMG_SIZE = (224, 224)
BASE_DIR = pathlib.Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "cnh_classifier.keras"
# Abaixo desta nota da rede, uma imagem (não PDF) quase certamente não é uma CNH: não vale gastar OCR.
OCR_MIN_SCORE = 0.15


def classify_image(file_path: str) -> dict:
    """Só a rede neural: `is_valid`, `confidence` e `score`."""
    if not MODEL_PATH.exists():
        return {
            "is_valid": False,
            "confidence": "low",
            "score": 0.0,
            "error": f"Modelo não encontrado em {MODEL_PATH}",
        }

    model = tf.keras.models.load_model(str(MODEL_PATH))

    path = pathlib.Path(file_path)
    if path.suffix.lower() == ".pdf":
        from pdf2image import convert_from_path

        pages = convert_from_path(str(path), first_page=1, last_page=1)
        img = pages[0]
    else:
        img = Image.open(file_path).convert("RGB")

    img = img.resize(IMG_SIZE, Image.Resampling.LANCZOS)
    arr = np.array(img, dtype=np.float32)

    if arr.ndim == 2:
        arr = np.stack([arr] * 3, axis=-1)
    elif arr.shape[-1] == 4:
        arr = arr[:, :, :3]

    arr = np.expand_dims(arr, axis=0)
    prediction = model.predict(arr, verbose=0)
    raw_score = float(prediction[0][0])

    # cnh=0, not_cnh=1
    cnh_score = 1.0 - raw_score

    if cnh_score >= 0.85:
        confidence = "high"
    elif cnh_score >= 0.5:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "is_valid": cnh_score >= 0.5,
        "confidence": confidence,
        "score": round(cnh_score, 4),
    }


def read_fields(file_path: str, score: float) -> dict:
    """OCR do documento. Devolve `document_type`, `fields`, `uncertain_fields` e `promotes`."""
    empty = {
        "document_type": "desconhecido",
        "fields": None,
        "uncertain_fields": [],
        "promotes": False,
    }
    if os.environ.get("CNH_OCR", "1") == "0":
        return empty
    if score < OCR_MIN_SCORE and pathlib.Path(file_path).suffix.lower() != ".pdf":
        return empty
    try:
        from lib.reader import read_document

        reading = read_document(file_path)
    except Exception as exc:
        print(f"OCR indisponível: {type(exc).__name__}", file=sys.stderr)
        return empty

    fields: dict | None = None
    if reading.fields:
        fields = dict(reading.fields)
        if "ear" in fields:
            fields["ear"] = True
    return {
        "document_type": reading.document_type,
        "fields": fields,
        "uncertain_fields": reading.uncertain,
        "promotes": reading.promotes,
    }


def classify(file_path: str) -> dict:
    result = classify_image(file_path)
    if "error" in result:
        return {**result, "document_type": "desconhecido", "fields": None, "uncertain_fields": []}

    ocr = read_fields(file_path, result["score"])
    if ocr.pop("promotes") and not result["is_valid"]:
        result["is_valid"] = True
        result["confidence"] = "medium"  # a nota da rede continua baixa: só o OCR garantiu
    return {**result, **ocr}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Uso: classify.py <arquivo>"}))
        sys.exit(1)

    result = classify(sys.argv[1])
    print(json.dumps(result))
