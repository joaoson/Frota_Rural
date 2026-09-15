from collections.abc import Mapping
from typing import Any
from uuid import UUID, uuid4

from django.core.files.uploadedfile import UploadedFile
from django.db import IntegrityError, transaction
from django.db.models import Q, QuerySet
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from common.db import enforce_constraints_now
from common.exceptions import BadGateway, Conflict, ServiceUnavailable
from djangoapi import firebase_storage
from postings.enums import PostingStatus
from postings.models import Postings, PostingsPhotos
from postings.serializer import (
    PostingFilterSerializer,
    PostingInputSerializer,
    PostingPhotoUploadInputSerializer,
)

MAX_PHOTO_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_PHOTO_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})


class PostingService:
    @staticmethod
    def _queryset() -> QuerySet[Postings]:
        return Postings.objects.select_related("machinery").prefetch_related("postingsphotos_set")

    @staticmethod
    def get(posting_id: UUID) -> Postings:
        try:
            return PostingService._queryset().get(id=posting_id)
        except Postings.DoesNotExist as exc:
            raise NotFound("Anúncio não encontrado.") from exc

    @staticmethod
    def list(filters: Mapping[str, Any]) -> QuerySet[Postings]:
        serializer = PostingFilterSerializer(data=filters)
        serializer.is_valid(raise_exception=True)
        params: dict[str, Any] = serializer.validated_data

        queryset = PostingService._queryset().order_by("-created_at", "-id")
        if "machinery" in params:
            queryset = queryset.filter(machinery_id=params["machinery"])
        if "status" in params:
            queryset = queryset.filter(status=params["status"])
        # Filtro de data: sobreposição entre a disponibilidade do anúncio e o
        # período pedido. Datas nulas contam como "sem restrição", então anúncio
        # sem janela definida aparece em qualquer busca.
        if "available_from" in params:
            queryset = queryset.filter(
                Q(availability_end__isnull=True)
                | Q(availability_end__date__gte=params["available_from"])
            )
        if "available_until" in params:
            queryset = queryset.filter(
                Q(availability_start__isnull=True)
                | Q(availability_start__date__lte=params["available_until"])
            )
        return queryset

    @staticmethod
    @transaction.atomic
    def create(data: Mapping[str, Any]) -> Postings:
        serializer = PostingInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        now = timezone.now()
        try:
            return serializer.save(
                id=uuid4(),
                status=serializer.validated_data.get("status") or PostingStatus.ACTIVE,
                created_at=now,
                updated_at=now,
            )
        except IntegrityError as exc:
            raise Conflict("Dados em conflito com um anúncio existente.") from exc

    @staticmethod
    @transaction.atomic
    def update(posting_id: UUID, data: Mapping[str, Any], *, partial: bool = False) -> Postings:
        posting = PostingService.get(posting_id)
        serializer = PostingInputSerializer(posting, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        try:
            return serializer.save(updated_at=timezone.now())
        except IntegrityError as exc:
            raise Conflict("Dados em conflito com um anúncio existente.") from exc

    @staticmethod
    @transaction.atomic
    def delete(posting_id: UUID) -> None:
        posting = PostingService.get(posting_id)
        enforce_constraints_now()
        try:
            posting.delete()
        except IntegrityError as exc:
            raise Conflict(
                "Não é possível excluir este anúncio: existem registros dependentes.",
                code="has_dependents",
            ) from exc


class PostingPhotoService:
    @staticmethod
    def upload(
        posting_id: UUID,
        image: UploadedFile | None,
        data: Mapping[str, Any],
        *,
        content_type: str,
    ) -> PostingsPhotos:
        """Envia a foto ao Firebase e grava o caminho no anúncio.

        O upload acontece fora da transação: segurar uma transação aberta
        durante uma chamada de rede não protege nada e prende a conexão.
        """
        try:
            posting = Postings.objects.get(id=posting_id)
        except Postings.DoesNotExist as exc:
            raise NotFound("Anúncio não encontrado.") from exc

        serializer = PostingPhotoUploadInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        is_primary: bool = serializer.validated_data["is_primary"]

        PostingPhotoService._validate_image(image, content_type)
        assert image is not None  # garantido por _validate_image

        try:
            image_path = firebase_storage.upload_image(image, folder=f"postings/{posting.id}")
        except firebase_storage.FirebaseStorageNotConfigured as exc:
            raise ServiceUnavailable(str(exc)) from exc
        except Exception as exc:
            raise BadGateway("Erro ao enviar a imagem para o Firebase.") from exc

        return PostingPhotoService._save_photo(posting, image_path, is_primary=is_primary)

    @staticmethod
    def _validate_image(image: UploadedFile | None, content_type: str) -> None:
        if image is None:
            # Sem corpo multipart o Django nem chega a popular request.FILES. Vale
            # distinguir os dois casos: o cliente que erra o Content-Type recebe
            # uma mensagem que aponta a causa, em vez de "nenhum arquivo".
            media_type = (content_type or "").split(";")[0].strip()
            if media_type != "multipart/form-data":
                raise ValidationError(
                    "A requisição precisa ser multipart/form-data; foi recebido "
                    f"'{media_type or 'nenhum Content-Type'}'."
                )
            raise ValidationError("Nenhum arquivo enviado.")

        if image.content_type not in ALLOWED_PHOTO_TYPES:
            raise ValidationError(
                "Tipo de arquivo não suportado. Envie JPG, PNG ou WEBP "
                f"(recebido: '{image.content_type}')."
            )

        if (image.size or 0) > MAX_PHOTO_BYTES:
            megabytes = (image.size or 0) / (1024 * 1024)
            raise ValidationError(f"'{image.name}' tem {megabytes:.1f}MB e excede o máximo de 5MB.")

    @staticmethod
    @transaction.atomic
    def _save_photo(posting: Postings, image_path: str, *, is_primary: bool) -> PostingsPhotos:
        # Só uma foto por anúncio pode ser a capa.
        if is_primary:
            PostingsPhotos.objects.filter(postings=posting, is_primary=True).update(
                is_primary=False
            )
        return PostingsPhotos.objects.create(
            id=uuid4(),
            postings=posting,
            image_url=image_path,
            is_primary=is_primary,
            created_at=timezone.now(),
        )
