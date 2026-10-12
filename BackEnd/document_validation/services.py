import logging
from collections.abc import Mapping
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from uuid import UUID, uuid4

from django.conf import settings
from django.core.files.uploadedfile import UploadedFile
from django.db import IntegrityError, transaction
from django.db.models import QuerySet
from django.utils import timezone
from rest_framework.exceptions import APIException, NotFound, ValidationError

from users.models import Users
from common.exceptions import Conflict, ServiceUnavailable
from document_validation.enums import ValidationStatus
from document_validation.ml_adapters import CnhClassifier, CnhDataChecker
from document_validation.models import Certification, OperatorLicense
from document_validation.serializer import (
    CertificationInputSerializer,
    DocumentFilterSerializer,
    DocumentReviewInputSerializer,
    OperatorLicenseInputSerializer,
)

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
ALLOWED_TYPES = frozenset({"image/jpeg", "image/png", "image/webp", "application/pdf"})

# Campos da CNH enviados ao modelo de plausibilidade (ver ml/cnh_data/README.md).
SCREENED_FIELDS = (
    "name", "birth_date", "cpf", "rg", "mother_name", "father_name", "nationality",
    "birth_place", "cnh_number", "category", "first_license_date", "issue_date",
    "expiration_date", "issuing_state", "issuing_authority", "situation", "acc", "ear",
    "medical_restrictions", "observations", "points",
)  # fmt: skip


def _apply_review(document: OperatorLicense | Certification, data: Mapping[str, Any]) -> None:
    """Grava a decisão do administrador em uma CNH ou certificação."""
    serializer = DocumentReviewInputSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    document.validation_status = serializer.validated_data["validation_status"]
    document.review_note = serializer.validated_data.get("review_note") or None
    document.updated_at = timezone.now()
    update_fields = ["validation_status", "review_note", "updated_at"]
    if isinstance(document, OperatorLicense):
        # A decisão de uma pessoa substitui a do modelo.
        document.auto_rejected = False
        update_fields.append("auto_rejected")
    document.save(update_fields=update_fields)


def _stored_document(file_url: str | None) -> Path | None:
    """Arquivo em `MEDIA_ROOT/documents/` a que `file_url` se refere, ou `None`.

    `file_url` vem do cliente: só vale o que o próprio `upload` devolveria (um nome simples
    dentro de `documents/`), para que ninguém aponte o OCR para outro arquivo do servidor.
    """
    if not file_url:
        return None
    prefix = f"{settings.MEDIA_URL}documents/"
    path = urlparse(file_url).path
    if not path.startswith(prefix):
        return None
    name = path.removeprefix(prefix)
    if not name or name != Path(name).name:
        return None
    candidate = Path(settings.MEDIA_ROOT) / "documents" / name
    return candidate if candidate.is_file() else None


def _read_stored_document(license_: OperatorLicense) -> dict[str, Any] | None:
    """OCR do arquivo salvo da CNH, no formato que o `cnh_data` espera, ou `None`.

    Roda de novo no servidor (o cliente não pode forjar o que foi lido). Qualquer problema
    (sem arquivo, OCR indisponível, layout não reconhecido) vira `None`: o modelo então
    avalia só a plausibilidade dos dados. Os valores lidos nunca vão para o log.
    """
    path = _stored_document(license_.file_url)
    if path is None:
        return None
    try:
        reading = CnhClassifier.classify_path(path)
    except Exception as exc:
        logger.warning("OCR da CNH %s indisponível (%s).", license_.id, type(exc).__name__)
        return None
    fields = reading.get("fields")
    if "error" in reading or not fields:
        return None
    return {"fields": fields, "uncertain_fields": reading.get("uncertain_fields") or []}


def _screen_license(license_: OperatorLicense) -> None:
    """Avalia a veracidade dos dados da CNH (modelo `cnh_data`) e recusa se forem falsos.

    O modelo compara o digitado com o que o OCR leu da foto salva e calcula o índice de
    veracidade (guardado em `veracity_score`). Sem foto ou com pouco OCR, vale só a
    plausibilidade dos dados. O envio nunca é bloqueado: a CNH já foi gravada como
    `pending` e, se o modelo a considerar suspeita, é regravada como `rejected` com o
    motivo em `review_note`. Quem reedita a CNH volta para `pending` e é reavaliado (ver
    `update`).

    `ML_PLAUSIBILITY_MODE`: `off` desliga, `shadow` só calcula o índice e registra em log,
    e `enforce` também recusa.
    """
    mode = settings.ML_PLAUSIBILITY_MODE
    if mode == "off":
        return

    record = {name: getattr(license_, name) for name in SCREENED_FIELDS}
    result = CnhDataChecker.check(record, _read_stored_document(license_))
    if result.veracity is not None:
        license_.veracity_score = result.veracity
        license_.save(update_fields=["veracity_score"])
    if not result.is_suspicious:
        return

    # Sem nome, CPF ou outros dados pessoais no log: só o id, a decisão e os motivos das regras.
    logger.info(
        "CNH %s considerada suspeita (modo=%s, score=%.2f, veracidade=%s, base=%s, campos=%s, motivos=%s)",
        license_.id, mode, result.score, result.veracity, result.basis, result.fields,
        result.reasons,
    )  # fmt: skip
    if mode != "enforce":
        return

    license_.validation_status = ValidationStatus.REJECTED
    license_.review_note = result.review_note
    license_.auto_rejected = True
    license_.save(update_fields=["validation_status", "review_note", "auto_rejected"])


class OperatorLicenseService:
    @staticmethod
    def get(license_id: UUID, *, actor: Users) -> OperatorLicense:
        try:
            queryset = OperatorLicense.objects.all()
            if actor.role != "admin":
                queryset = queryset.filter(user=actor)
            return queryset.get(id=license_id)
        except OperatorLicense.DoesNotExist as exc:
            raise NotFound("CNH não encontrada.") from exc

    @staticmethod
    @transaction.atomic
    def create(data: Mapping[str, Any], *, actor: Users) -> OperatorLicense:
        """Cadastra a CNH, que entra aguardando a análise (ou recusada, se os dados parecerem falsos)."""
        serializer = OperatorLicenseInputSerializer(data=data, context={"actor": actor})
        serializer.is_valid(raise_exception=True)
        now = timezone.now()
        try:
            license_ = serializer.save(
                id=uuid4(),
                validation_status=ValidationStatus.PENDING,
                created_at=now,
                updated_at=now,
            )
        except IntegrityError as exc:
            raise Conflict("Dados em conflito com um registro existente.") from exc
        _screen_license(license_)
        return license_

    @staticmethod
    @transaction.atomic
    def update(
        license_id: UUID, data: Mapping[str, Any], *, actor: Users, partial: bool = False
    ) -> OperatorLicense:
        """Qualquer edição invalida a análise anterior: a CNH volta para `pending`.

        Depois disso os dados são reavaliados pelo modelo de plausibilidade, então uma
        edição corrigida sai da recusa automática e uma ainda suspeita volta a ela.
        """
        license_ = OperatorLicenseService.get(license_id, actor=actor)
        serializer = OperatorLicenseInputSerializer(
            license_, data=data, partial=partial, context={"actor": actor}
        )
        serializer.is_valid(raise_exception=True)
        try:
            license_ = serializer.save(
                validation_status=ValidationStatus.PENDING,
                review_note=None,
                auto_rejected=False,
                veracity_score=None,
                updated_at=timezone.now(),
            )
        except IntegrityError as exc:
            raise Conflict("Dados em conflito com um registro existente.") from exc
        _screen_license(license_)
        return license_

    @staticmethod
    @transaction.atomic
    def delete(license_id: UUID, *, actor: Users) -> None:
        OperatorLicenseService.get(license_id, actor=actor).delete()

    @staticmethod
    @transaction.atomic
    def review(license_id: UUID, data: Mapping[str, Any], *, actor: Users) -> OperatorLicense:
        license_ = OperatorLicenseService.get(license_id, actor=actor)
        _apply_review(license_, data)
        return license_

    @staticmethod
    def list(filters: Mapping[str, Any], *, actor: Users) -> QuerySet[OperatorLicense]:
        serializer = DocumentFilterSerializer(data=filters)
        serializer.is_valid(raise_exception=True)
        params: dict[str, Any] = serializer.validated_data

        queryset = OperatorLicense.objects.order_by("-created_at", "-id")
        if actor.role != "admin":
            queryset = queryset.filter(user=actor)
        if "user" in params:
            queryset = queryset.filter(user_id=params["user"])
        if "validation_status" in params:
            queryset = queryset.filter(validation_status=params["validation_status"])
        return queryset


class CertificationService:
    @staticmethod
    def get(certification_id: UUID, *, actor: Users) -> Certification:
        try:
            queryset = Certification.objects.all()
            if actor.role != "admin":
                queryset = queryset.filter(user=actor)
            return queryset.get(id=certification_id)
        except Certification.DoesNotExist as exc:
            raise NotFound("Certificação não encontrada.") from exc

    @staticmethod
    @transaction.atomic
    def create(data: Mapping[str, Any], *, actor: Users) -> Certification:
        """Cadastra a certificação, que sempre entra aguardando a análise."""
        serializer = CertificationInputSerializer(data=data, context={"actor": actor})
        serializer.is_valid(raise_exception=True)
        now = timezone.now()
        try:
            return serializer.save(
                id=uuid4(),
                validation_status=ValidationStatus.PENDING,
                created_at=now,
                updated_at=now,
            )
        except IntegrityError as exc:
            raise Conflict("Dados em conflito com um registro existente.") from exc

    @staticmethod
    @transaction.atomic
    def update(
        certification_id: UUID, data: Mapping[str, Any], *, actor: Users, partial: bool = False
    ) -> Certification:
        """Qualquer edição invalida a análise anterior: volta para `pending`."""
        certification = CertificationService.get(certification_id, actor=actor)
        serializer = CertificationInputSerializer(certification, data=data, partial=partial, context={"actor": actor})
        serializer.is_valid(raise_exception=True)
        try:
            return serializer.save(
                validation_status=ValidationStatus.PENDING,
                review_note=None,
                updated_at=timezone.now(),
            )
        except IntegrityError as exc:
            raise Conflict("Dados em conflito com um registro existente.") from exc

    @staticmethod
    @transaction.atomic
    def delete(certification_id: UUID, *, actor: Users) -> None:
        CertificationService.get(certification_id, actor=actor).delete()

    @staticmethod
    @transaction.atomic
    def review(certification_id: UUID, data: Mapping[str, Any], *, actor: Users) -> Certification:
        certification = CertificationService.get(certification_id, actor=actor)
        _apply_review(certification, data)
        return certification

    @staticmethod
    def list(filters: Mapping[str, Any], *, actor: Users) -> QuerySet[Certification]:
        serializer = DocumentFilterSerializer(data=filters)
        serializer.is_valid(raise_exception=True)
        params: dict[str, Any] = serializer.validated_data

        queryset = Certification.objects.order_by("-created_at", "-id")
        if actor.role != "admin":
            queryset = queryset.filter(user=actor)
        if "user" in params:
            queryset = queryset.filter(user_id=params["user"])
        if "validation_status" in params:
            queryset = queryset.filter(validation_status=params["validation_status"])
        return queryset


class DocumentFileService:
    @staticmethod
    def upload(file: UploadedFile | None) -> str:
        """Grava o arquivo em `MEDIA_ROOT/documents/` com nome único e devolve a URL."""
        document = DocumentFileService._validate(file)

        extension = Path(document.name or "").suffix.lower() or ".jpg"
        filename = f"{uuid4()}{extension}"
        upload_dir = Path(settings.MEDIA_ROOT) / "documents"
        upload_dir.mkdir(parents=True, exist_ok=True)

        with (upload_dir / filename).open("wb") as destination:
            for chunk in document.chunks():
                destination.write(chunk)

        return f"{settings.MEDIA_URL}documents/{filename}"

    @staticmethod
    def classify_cnh(file: UploadedFile | None) -> dict[str, Any]:
        """Classifica o arquivo como CNH ou não. Não grava nada."""
        document = DocumentFileService._validate(file)
        try:
            return CnhClassifier.classify(document)
        except FileNotFoundError as exc:
            raise ServiceUnavailable(str(exc)) from exc
        except Exception as exc:
            raise APIException(
                "Erro ao processar o documento.", code="classification_error"
            ) from exc

    @staticmethod
    def _validate(file: UploadedFile | None) -> UploadedFile:
        if file is None:
            raise ValidationError("Nenhum arquivo enviado.")
        if file.content_type not in ALLOWED_TYPES:
            raise ValidationError("Tipo de arquivo não suportado. Envie JPG, PNG, WEBP ou PDF.")
        if (file.size or 0) > MAX_FILE_SIZE:
            raise ValidationError("Arquivo excede o tamanho máximo de 20MB.")
        return file
