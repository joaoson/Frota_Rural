"""Exporta o OCR das fotos de validação junto com a verdade do ground truth.

Gera `ml/data/eval/ocr_readings.jsonl` (ignorado pelo git, regenerável), uma linha por foto:

    {"photo": "00001234_in.jpg", "document": "<hash do documento>",
     "ocr": {"fields": {...}, "uncertain_fields": [...]} | null,
     "truth": {campo: valor}}

É a ponte para o `ml/cnh_data/scripts/evaluate_veracity.py`: o modelo de dados simula
cadastros (honestos e falsos) contra estas leituras sem importar o código do `cnh_image`.
Só as fotos de documentos de **validação** entram (o layout foi aprendido nas demais).
Os documentos do dataset BID são fictícios.

Uso: ./ml/venv/bin/python ml/cnh_image/scripts/export_readings.py [--limit N]
"""

import argparse
import hashlib
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from evaluate_ocr import validation_photos
from lib.groundtruth import document_key, read_gt
from lib.ocr import OcrUnavailable
from lib.reader import read_document

OUTPUT = pathlib.Path(__file__).resolve().parents[2] / "data" / "eval" / "ocr_readings.jsonl"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--limit", type=int, default=0, help="exporta só N fotos (0 = todas)")
    args = parser.parse_args()

    photos = validation_photos()
    if args.limit:
        photos = photos[: args.limit]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    print(f"[INFO] lendo {len(photos)} fotos de validação...")
    try:
        with OUTPUT.open("w", encoding="utf-8") as out:
            for index, (image, truth) in enumerate(photos, 1):
                reading = read_document(str(image))
                gt = image.with_name(image.name.replace("_in.jpg", "_gt_ocr.txt"))
                key = "\n".join(document_key(read_gt(gt)))
                row = {
                    "photo": image.name,
                    "document": hashlib.md5(key.encode(), usedforsecurity=False).hexdigest()[:12],
                    "ocr": {"fields": reading.fields, "uncertain_fields": reading.uncertain}
                    if reading.fields
                    else None,
                    "truth": truth,
                }
                out.write(json.dumps(row, ensure_ascii=False) + "\n")
                if index % 50 == 0:
                    print(f"    {index}/{len(photos)}...")
    except OcrUnavailable as exc:
        print(f"[ERRO] {exc}")
        return
    print(f"[SALVO] {OUTPUT}")


if __name__ == "__main__":
    main()
