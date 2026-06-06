import json
import sys
import os
import pathlib

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

import numpy as np
from PIL import Image
import tensorflow as tf

IMG_SIZE = (224, 224)
BASE_DIR = pathlib.Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "cnh_classifier.keras"


def classify(file_path: str) -> dict:
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


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Uso: classify.py <arquivo>"}))
        sys.exit(1)

    result = classify(sys.argv[1])
    print(json.dumps(result))
