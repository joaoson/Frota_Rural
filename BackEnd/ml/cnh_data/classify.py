"""Inferência do modelo de veracidade dos dados da CNH.

Chamado pelo Django via subprocess (`document_validation/ml_adapters/cnh_data.py`).
Lê do **stdin** um JSON com o cadastro e, se houver, o OCR da foto (CPF e nomes ficam fora
do `argv`, que qualquer usuário da máquina enxerga com `ps`):

    {"record": {...campos do cadastro...},
     "ocr": {"fields": {...}, "uncertain_fields": [...]} | null}    # saída do cnh_image

e imprime uma linha JSON:

    {"is_suspicious": bool, "score": 0.0-1.0,       # nota de "dado falso" combinada
     "veracity": 0-100,                              # índice de veracidade (maior = mais verdadeiro)
     "basis": "ocr+plausibility" | "plausibility",   # em que o índice se baseou
     "consistency": {campo: "match"|"mismatch"|"absent"},
     "mismatch_fields": [...],                       # o que o OCR contradiz de forma inequívoca
     "reasons": [...], "fields": [...]}

Sem `ocr` (ou com poucos campos lidos), vale só a plausibilidade dos dados digitados.
Se o modelo ou as bases de referência não existirem, devolve o mesmo formato com
`is_suspicious: false` e o campo `error`: falha técnica nunca vira recusa.

Variável de ambiente opcional: ML_PLAUSIBILITY_THRESHOLD (padrão em `lib/model.py`).

Uso: echo '{"record": {"name": "..."}}' | ./ml/venv/bin/python ml/cnh_data/classify.py
"""

import json
import os
import pathlib
import sys
from typing import Any

from lib.model import THRESHOLD, PlausibilityModel, assess
from lib.reference import reference_available

BASE_DIR = pathlib.Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "cnh_plausibility.joblib"


def _failure(message: str) -> dict[str, Any]:
    return {
        "is_suspicious": False,
        "score": 0.0,
        "reasons": [],
        "fields": [],
        "veracity": None,
        "basis": None,
        "consistency": {},
        "mismatch_fields": [],
        "error": message,
    }


def _threshold() -> float:
    try:
        return float(os.environ.get("ML_PLAUSIBILITY_THRESHOLD", THRESHOLD))
    except ValueError:
        return THRESHOLD


def classify(record: dict[str, Any], ocr: dict[str, Any] | None = None) -> dict[str, Any]:
    if not MODEL_PATH.exists():
        return _failure(f"Modelo não encontrado em {MODEL_PATH}")
    if not reference_available():
        return _failure("Bases de referência (ml/data/names e ml/data/cities) não encontradas")
    return assess(record, PlausibilityModel.load(MODEL_PATH), _threshold(), ocr=ocr)


if __name__ == "__main__":
    try:
        payload = json.loads(sys.stdin.read())
    except json.JSONDecodeError:
        payload = None
    record = payload.get("record") if isinstance(payload, dict) else None
    ocr = payload.get("ocr") if isinstance(payload, dict) else None
    if not isinstance(record, dict) or not (ocr is None or isinstance(ocr, dict)):
        print(json.dumps({"error": 'Uso: enviar {"record": {...}, "ocr": {...} | null} no stdin'}))
        sys.exit(1)

    print(json.dumps(classify(record, ocr), ensure_ascii=False))
