import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.files.uploadedfile import UploadedFile

logger = logging.getLogger(__name__)

ML_DIR = Path(settings.BASE_DIR) / "ml"
# A imagem Docker fornece este interpretador em /opt/ml-venv; o caminho local
# continua sendo o padrão para quem executa o projeto sem containers.
ML_PYTHON = Path(os.getenv("ML_PYTHON", str(ML_DIR / "venv" / "bin" / "python")))
CLASSIFY_SCRIPT = ML_DIR / "classify.py"
MODEL_PATH = ML_DIR / "models" / "cnh_classifier.keras"
CLASSIFY_TIMEOUT_SECONDS = 30


def _failure(message: str) -> dict[str, Any]:
    return {"is_valid": False, "confidence": "low", "score": 0.0, "error": message}


class CnhClassifier:
    """Adaptador do classificador de CNH, que roda no interpretador isolado do ML.

    O TensorFlow não suporta a versão de Python do Django, então a inferência é
    feita por `subprocess` em `ml/classify.py`.
    """

    @staticmethod
    def check_setup() -> None:
        """`FileNotFoundError` se o venv do ML ou o modelo treinado não existirem."""
        if not ML_PYTHON.exists():
            raise FileNotFoundError(
                f"Venv do ML não encontrado em {ML_PYTHON}. "
                "Crie com: cd BackEnd/ml && python3.13 -m venv venv && "
                "./venv/bin/pip install tensorflow Pillow pdf2image"
            )
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"Modelo não encontrado em {MODEL_PATH}. "
                "Execute: ./ml/venv/bin/python ml/train_cnh_classifier.py"
            )

    @staticmethod
    def classify(file: UploadedFile) -> dict[str, Any]:
        """Grava o upload em arquivo temporário e devolve o JSON do classificador.

        Falhas do próprio motor (processo com erro, timeout, saída inválida) não
        levantam: voltam como documento recusado com o campo `error`.
        """
        CnhClassifier.check_setup()

        suffix = ".pdf" if file.content_type == "application/pdf" else ".jpg"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            for chunk in file.chunks():
                tmp.write(chunk)
            tmp_path = Path(tmp.name)

        try:
            result = subprocess.run(
                [str(ML_PYTHON), str(CLASSIFY_SCRIPT), str(tmp_path)],
                capture_output=True,
                text=True,
                timeout=CLASSIFY_TIMEOUT_SECONDS,
                check=False,
            )
            if result.returncode != 0:
                logger.error("Erro no classify.py: %s", result.stderr)
                return _failure("Erro ao processar o documento.")
            classification: dict[str, Any] = json.loads(result.stdout)
            return classification
        except subprocess.TimeoutExpired:
            return _failure("Tempo limite excedido ao analisar o documento.")
        except (json.JSONDecodeError, OSError) as exc:
            logger.error("Erro ao decodificar resultado: %s", exc)
            return _failure("Erro ao processar o documento.")
        finally:
            tmp_path.unlink(missing_ok=True)
