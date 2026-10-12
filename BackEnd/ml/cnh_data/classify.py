"""Inferência do modelo de plausibilidade dos dados da CNH.

Chamado pelo Django via subprocess (`document_validation/ml_adapters/cnh_data.py`).
Lê do **stdin** o registro do cadastro em JSON (CPF e nomes ficam fora do `argv`, que
qualquer usuário da máquina enxerga com `ps`) e imprime uma linha JSON:

    {"is_suspicious": bool, "confidence": "high|medium|low", "score": 0.0-1.0,
     "reasons": [...], "fields": [...]}

Se o modelo ou as bases de referência não existirem, devolve o mesmo formato com
`is_suspicious: false` e o campo `error`: falha técnica nunca vira recusa.

Variável de ambiente opcional: ML_PLAUSIBILITY_THRESHOLD (padrão em `lib/model.py`).

Uso: echo '{"name": "..."}' | ./ml/venv/bin/python ml/cnh_data/classify.py
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
        "confidence": "low",
        "score": 0.0,
        "reasons": [],
        "fields": [],
        "error": message,
    }


def _threshold() -> float:
    try:
        return float(os.environ.get("ML_PLAUSIBILITY_THRESHOLD", THRESHOLD))
    except ValueError:
        return THRESHOLD


def classify(record: dict[str, Any]) -> dict[str, Any]:
    if not MODEL_PATH.exists():
        return _failure(f"Modelo não encontrado em {MODEL_PATH}")
    if not reference_available():
        return _failure("Bases de referência (ml/data/names e ml/data/cities) não encontradas")
    return assess(record, PlausibilityModel.load(MODEL_PATH), _threshold())


if __name__ == "__main__":
    try:
        payload = json.loads(sys.stdin.read())
    except json.JSONDecodeError:
        payload = None
    if not isinstance(payload, dict):
        print(json.dumps({"error": "Uso: enviar o registro da CNH como JSON no stdin"}))
        sys.exit(1)

    print(json.dumps(classify(payload), ensure_ascii=False))
