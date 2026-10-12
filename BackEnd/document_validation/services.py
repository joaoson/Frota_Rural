from collections.abc import Mapping
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from django.conf import settings
from django.core.files.uploadedfile import UploadedFile
from django.db import IntegrityError, transaction
from django.db.models import QuerySet
from django.utils import timezone
from rest_framework.exceptions import APIException, NotFound, ValidationError

from common.exceptions import Conflict, ServiceUnavailable
from document_validation.classifier import CnhClassifier
from document_validation.enums import ValidationStatus
from document_validation.models import Certification, OperatorLicense
from document_validation.serializer import (
    CertificationInputSerializer,
    DocumentFilterSerializer,
    DocumentReviewInputSerializer,
    OperatorLicenseInputSerializer,
)

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
ALLOWED_TYPES = frozenset({"image/jpeg", "image/png", "image/webp", "application/pdf"})


def _apply_review(document: OperatorLicense | Certification, data: Mapping[str, Any]) -> None:
    """Grava a decisão do administrador em uma CNH ou certificação."""
    serializer = DocumentReviewInputSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    document.validation_status = serializer.validated_data["validation_status"]
    document.review_note = serializer.validated_data.get("review_note") or None
    document.updated_at = timezone.now()
    document.save(update_fields=["validation_status", "review_note", "updated_at"])


class OperatorLicenseService:
    @staticmethod
    def get(license_id: UUID) -> OperatorLicense:
        try:
            return OperatorLicense.objects.get(id=license_id)
        except OperatorLicense.DoesNotExist as exc:
            raise NotFound("CNH não encontrada.") from exc

    @staticmethod
    @transaction.atomic
    def create(data: Mapping[str, Any]) -> OperatorLicense:
        """Cadastra a CNH, que sempre entra aguardando a análise."""
        serializer = OperatorLicenseInputSerializer(data=data)
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
        license_id: UUID, data: Mapping[str, Any], *, partial: bool = False
    ) -> OperatorLicense:
        """Qualquer edição invalida a análise anterior: a CNH volta para `pending`."""
        license_ = OperatorLicenseService.get(license_id)
        serializer = OperatorLicenseInputSerializer(license_, data=data, partial=partial)
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
    def delete(license_id: UUID) -> None:
        OperatorLicenseService.get(license_id).delete()

    @staticmethod
    @transaction.atomic
    def review(license_id: UUID, data: Mapping[str, Any]) -> OperatorLicense:
        license_ = OperatorLicenseService.get(license_id)
        _apply_review(license_, data)
        return license_

    @staticmethod
    def list(filters: Mapping[str, Any]) -> QuerySet[OperatorLicense]:
        serializer = DocumentFilterSerializer(data=filters)
        serializer.is_valid(raise_exception=True)
        params: dict[str, Any] = serializer.validated_data

        queryset = OperatorLicense.objects.order_by("-created_at", "-id")
        if "user" in params:
            queryset = queryset.filter(user_id=params["user"])
        if "validation_status" in params:
            queryset = queryset.filter(validation_status=params["validation_status"])
        return queryset


class CertificationService:
    @staticmethod
    def get(certification_id: UUID) -> Certification:
        try:
            return Certification.objects.get(id=certification_id)
        except Certification.DoesNotExist as exc:
            raise NotFound("Certificação não encontrada.") from exc

    @staticmethod
    @transaction.atomic
    def create(data: Mapping[str, Any]) -> Certification:
        """Cadastra a certificação, que sempre entra aguardando a análise."""
        serializer = CertificationInputSerializer(data=data)
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
        certification_id: UUID, data: Mapping[str, Any], *, partial: bool = False
    ) -> Certification:
        """Qualquer edição invalida a análise anterior: volta para `pending`."""
        certification = CertificationService.get(certification_id)
        serializer = CertificationInputSerializer(certification, data=data, partial=partial)
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
    def delete(certification_id: UUID) -> None:
        CertificationService.get(certification_id).delete()

    @staticmethod
    @transaction.atomic
    def review(certification_id: UUID, data: Mapping[str, Any]) -> Certification:
        certification = CertificationService.get(certification_id)
        _apply_review(certification, data)
        return certification

    @staticmethod
    def list(filters: Mapping[str, Any]) -> QuerySet[Certification]:
        serializer = DocumentFilterSerializer(data=filters)
        serializer.is_valid(raise_exception=True)
        params: dict[str, Any] = serializer.validated_data

        queryset = Certification.objects.order_by("-created_at", "-id")
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
