import json
import logging
import subprocess
import tempfile

from django.conf import settings

logger = logging.getLogger(__name__)

ML_DIR = settings.BASE_DIR / "ml"
ML_PYTHON = ML_DIR / "venv" / "bin" / "python"
CLASSIFY_SCRIPT = ML_DIR / "classify.py"
MODEL_PATH = ML_DIR / "models" / "cnh_classifier.keras"


class CnhClassifier:

    @staticmethod
    def _check_setup():
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
    def classify(file) -> dict:
        """
        Recebe um InMemoryUploadedFile do Django, salva em arquivo
        temporário, chama o script de classificação via subprocess
        e retorna o resultado.
        """
        CnhClassifier._check_setup()

        suffix = ".pdf" if getattr(file, "content_type", "") == "application/pdf" else ".jpg"

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            for chunk in file.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name

        try:
            result = subprocess.run(
                [str(ML_PYTHON), str(CLASSIFY_SCRIPT), tmp_path],
                capture_output=True,
                text=True,
                timeout=30,
            )

            if result.returncode != 0:
                logger.error("Erro no classify.py: %s", result.stderr)
                return {
                    "is_valid": False,
                    "confidence": "low",
                    "score": 0.0,
                    "error": "Erro ao processar o documento.",
                }

            return json.loads(result.stdout)

        except subprocess.TimeoutExpired:
            return {
                "is_valid": False,
                "confidence": "low",
                "score": 0.0,
                "error": "Tempo limite excedido ao analisar o documento.",
            }
        except (json.JSONDecodeError, Exception) as e:
            logger.error("Erro ao decodificar resultado: %s", e)
            return {
                "is_valid": False,
                "confidence": "low",
                "score": 0.0,
                "error": "Erro ao processar o documento.",
            }
        finally:
            import os
            os.unlink(tmp_path)
