"""Adaptador do modelo de plausibilidade dos dados da CNH (`ml/cnh_data/`).

Diferente do classificador de imagem (que, em caso de falha, devolve "documento
recusado"), este adaptador falha **para o lado seguro**: qualquer problema técnico
(modelo ausente, timeout, saída inválida) vira "não suspeito" e é só registrado em log.
Um erro de infraestrutura nunca recusa o cadastro de ninguém nem impede o envio.
"""

import json
import logging
import subprocess
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from document_validation.ml_adapters.common import ML_DIR, ML_PYTHON

logger = logging.getLogger(__name__)

MODULE_DIR = ML_DIR / "cnh_data"
CLASSIFY_SCRIPT = MODULE_DIR / "classify.py"
MODEL_PATH = MODULE_DIR / "models" / "cnh_plausibility.joblib"
CHECK_TIMEOUT_SECONDS = 10

REVIEW_NOTE = (
    "Os dados informados parecem inconsistentes ou falsos{fields}. "
    "Corrija e reenvie, ou aguarde a análise manual."
)


@dataclass(frozen=True)
class DataCheckResult:
    is_suspicious: bool = False
    confidence: str = "low"
    score: float = 0.0
    reasons: list[str] = field(default_factory=list)
    fields: list[str] = field(default_factory=list)
    error: str | None = None

    @property
    def review_note(self) -> str:
        """Texto mostrado ao dono da CNH. Cita os campos, nunca as regras nem o limiar."""
        where = f" ({', '.join(self.fields)})" if self.fields else ""
        return REVIEW_NOTE.format(fields=where)


def _json_default(value: object) -> str:
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


class CnhDataChecker:
    """Roda `ml/cnh_data/classify.py` no interpretador isolado do ML."""

    @staticmethod
    def check(record: Mapping[str, Any]) -> DataCheckResult:
        """Avalia o registro da CNH. Nunca levanta exceção (ver docstring do módulo).

        O registro vai por stdin, não por `argv`, para que CPF e nomes não apareçam
        na lista de processos da máquina.
        """
        if not ML_PYTHON.exists() or not MODEL_PATH.exists():
            logger.warning(
                "Modelo de plausibilidade indisponível (%s); cadastro não avaliado.", MODEL_PATH
            )
            return DataCheckResult(error="modelo indisponível")

        try:
            result = subprocess.run(
                [str(ML_PYTHON), str(CLASSIFY_SCRIPT)],
                input=json.dumps(record, default=_json_default, ensure_ascii=False),
                capture_output=True,
                text=True,
                timeout=CHECK_TIMEOUT_SECONDS,
                check=False,
            )
            if result.returncode != 0:
                logger.error("Erro no cnh_data/classify.py: %s", result.stderr)
                return DataCheckResult(error="processo falhou")
            payload: dict[str, Any] = json.loads(result.stdout)
        except subprocess.TimeoutExpired:
            logger.error("Tempo limite excedido no cnh_data/classify.py.")
            return DataCheckResult(error="tempo limite excedido")
        except (json.JSONDecodeError, OSError) as exc:
            logger.error("Erro ao decodificar resultado do cnh_data: %s", exc)
            return DataCheckResult(error="saída inválida")

        if payload.get("error"):
            logger.warning("cnh_data indisponível: %s", payload["error"])
            return DataCheckResult(error=str(payload["error"]))

        return DataCheckResult(
            is_suspicious=bool(payload.get("is_suspicious")),
            confidence=str(payload.get("confidence", "low")),
            score=float(payload.get("score", 0.0)),
            reasons=[str(item) for item in payload.get("reasons", [])],
            fields=[str(item) for item in payload.get("fields", [])],
        )
