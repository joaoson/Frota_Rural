FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# poppler-utils is required by pdf2image (and pdfimages) in the document-classification flow;
# libgl1 and libglib2.0-0 are required by opencv, which the OCR (rapidocr-onnxruntime) depends on.
RUN apt-get update \
    && apt-get install --no-install-recommends -y build-essential libpq-dev poppler-utils libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY BackEnd/docs/requirements.txt /tmp/requirements.txt
COPY BackEnd/ml/requirements.txt /tmp/ml-requirements.txt

RUN python -m pip install --upgrade pip \
    && python -m pip install -r /tmp/requirements.txt \
    && python -m venv /opt/ml-venv \
    && /opt/ml-venv/bin/pip install --upgrade pip \
    && /opt/ml-venv/bin/pip install -r /tmp/ml-requirements.txt \
    && /opt/ml-venv/bin/python -c "import cv2, joblib, numpy, onnxruntime, pdf2image, PIL, rapidocr_onnxruntime, sklearn, tensorflow"

COPY BackEnd/ /app/
COPY Devops/docker/backend/entrypoint.sh /entrypoint.sh
# backend_media volume mounted on it inherits this owner, otherwise Docker makes it root-owned
# and appuser cannot write uploads (PermissionError on /app/media/documents)
RUN chmod +x /entrypoint.sh \
    && mkdir -p /app/media \
    && useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000
