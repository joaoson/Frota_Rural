"""Configuração compartilhada pelos adaptadores dos modelos de ML.

Todos os modelos rodam no mesmo interpretador isolado (venv do ML), em subprocess.
Cada modelo tem a sua própria pasta em `ml/` (código e `models/`) e usa a pasta de
dados comum `ml/data/`.
"""

import os
from pathlib import Path

from django.conf import settings

ML_DIR = Path(settings.BASE_DIR) / "ml"
# A imagem Docker fornece este interpretador em /opt/ml-venv; o caminho local
# continua sendo o padrão para quem executa o projeto sem containers.
ML_PYTHON = Path(os.getenv("ML_PYTHON", str(ML_DIR / "venv" / "bin" / "python")))
