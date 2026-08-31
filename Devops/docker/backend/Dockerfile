FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# poppler-utils is required by pdf2image in the document-classification flow.
RUN apt-get update \
    && apt-get install --no-install-recommends -y build-essential libpq-dev poppler-utils \
    && rm -rf /var/lib/apt/lists/*

COPY BackEnd/docs/requirements.txt /tmp/requirements.txt
COPY BackEnd/ml/requirements.txt /tmp/ml-requirements.txt

RUN python -m pip install --upgrade pip \
    && python -m pip install -r /tmp/requirements.txt \
    && python -m venv /opt/ml-venv \
    && /opt/ml-venv/bin/pip install --upgrade pip \
    && /opt/ml-venv/bin/pip install -r /tmp/ml-requirements.txt

COPY BackEnd/ /app/
COPY Devops/docker/backend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    && useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000
