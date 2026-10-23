"""Adaptadores dos modelos de ML, um módulo por modelo (ver `ml/README.md`)."""

from document_validation.ml_adapters.cnh_data import CnhDataChecker, DataCheckResult
from document_validation.ml_adapters.cnh_image import CnhClassifier

__all__ = ["CnhClassifier", "CnhDataChecker", "DataCheckResult"]
