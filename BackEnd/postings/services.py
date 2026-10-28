import logging
from collections.abc import Mapping
from typing import Any
from uuid import UUID, uuid4

from django.core.files.uploadedfile import UploadedFile
from django.db import IntegrityError, transaction
from django.db.models import Q, QuerySet
from django.utils import timezone
from rest_framework.exceptions import NotFound

from common.db import enforce_constraints_now
from common.exceptions import BadGateway, Conflict, ServiceUnavailable
from common.images import validate_image_upload
from djangoapi import firebase_storage
from postings.enums import PostingStatus
from postings.models import ModalidadeEntrega, Postings, PostingsPhotos
from postings.serializer import (
    PostingFilterSerializer,
    PostingInputSerializer,
    PostingPhotoUploadInputSerializer,
)
from users.models import Users


def _link_pricing_suggestion(suggestion_id: UUID, posting: Postings) -> None:
    # A savepoint keeps a failed calibration write from aborting the posting.
    try:
        from pricing.models import PricingSuggestions
        with transaction.atomic():
            PricingSuggestions.objects.filter(id=suggestion_id, machinery_id=posting.machinery_id).update(
                posting=posting, accepted_hourly_rate=posting.hourly_rate)
    except Exception:
        logging.getLogger(__name__).exception("Não foi possível vincular a sugestão %s", suggestion_id)


class PostingService:
    @staticmethod
    def _queryset() -> QuerySet[Postings]:
        return Postings.objects.select_related("machinery__owner").prefetch_related("postingsphotos_set")

    @staticmethod
    def get(posting_id: UUID, *, actor: Users | None, write: bool = False) -> Postings:
        try:
            queryset = PostingService._queryset()
            if write:
                queryset = queryset.filter(machinery__owner=actor)
            elif getattr(actor, "role", None) != "admin":
                visible = Q(status="active", machinery__status="active")
                if actor is not None:
                    visible |= Q(machinery__owner=actor) | Q(rentals__lessee=actor)
                queryset = queryset.filter(visible).distinct()
            return queryset.get(id=posting_id)
        except Postings.DoesNotExist as exc:
            raise NotFound("Anúncio não encontrado.") from exc

    @staticmethod
    def list(filters: Mapping[str, Any], *, actor: Users | None) -> QuerySet[Postings]:
        serializer = PostingFilterSerializer(data=filters)
        serializer.is_valid(raise_exception=True)
        params: dict[str, Any] = serializer.validated_data

        queryset = PostingService._queryset().order_by("-created_at", "-id")
        owner = params.get("owner")
        if owner:
            queryset = queryset.filter(machinery__owner_id=owner)
        if not (getattr(actor, "role", None) == "admin" or (actor is not None and owner == actor.pk)):
            queryset = queryset.filter(status="active", machinery__status="active")
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
    def create(data: Mapping[str, Any], *, actor: Users) -> Postings:
        serializer = PostingInputSerializer(data=data, context={"actor": actor})
        serializer.is_valid(raise_exception=True)
        now = timezone.now()
        suggestion_id = serializer.validated_data.pop("suggestion_id", None)
        try:
            posting = serializer.save(
                id=uuid4(),
                status=serializer.validated_data.get("status") or PostingStatus.ACTIVE,
                created_at=now,
                updated_at=now,
            )
            if suggestion_id:
                _link_pricing_suggestion(suggestion_id, posting)
            return posting
        except IntegrityError as exc:
            raise Conflict("Dados em conflito com um anúncio existente.") from exc

    @staticmethod
    @transaction.atomic
    def update(posting_id: UUID, data: Mapping[str, Any], *, actor: Users, partial: bool = False) -> Postings:
        posting = PostingService.get(posting_id, actor=actor, write=True)
        serializer = PostingInputSerializer(posting, data=data, partial=partial, context={"actor": actor})
        serializer.is_valid(raise_exception=True)
        serializer.validated_data.pop("suggestion_id", None)
        try:
            return serializer.save(updated_at=timezone.now())
        except IntegrityError as exc:
            raise Conflict("Dados em conflito com um anúncio existente.") from exc

    @staticmethod
    @transaction.atomic
    def delete(posting_id: UUID, *, actor: Users) -> None:
        posting = PostingService.get(posting_id, actor=actor, write=True)
        enforce_constraints_now()
        if posting.rentals_set.exists():
            raise Conflict("O anúncio possui locações vinculadas e não pode ser excluído. Pause-o para preservar o histórico.", code="has_dependents")
        try:
            posting.postingsphotos_set.all().delete()
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
        actor: Users,
    ) -> PostingsPhotos:
        """Envia a foto ao Firebase e grava o caminho no anúncio.

        O upload acontece fora da transação: segurar uma transação aberta
        durante uma chamada de rede não protege nada e prende a conexão.
        """
        try:
            posting = Postings.objects.get(id=posting_id, machinery__owner=actor)
        except Postings.DoesNotExist as exc:
            raise NotFound("Anúncio não encontrado.") from exc

        serializer = PostingPhotoUploadInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        is_primary: bool = serializer.validated_data["is_primary"]

        image = validate_image_upload(image, content_type)

        try:
            image_path = firebase_storage.upload_image(image, folder=f"postings/{posting.id}")
        except firebase_storage.FirebaseStorageNotConfigured as exc:
            raise ServiceUnavailable(str(exc)) from exc
        except Exception as exc:
            raise BadGateway("Erro ao enviar a imagem para o Firebase.") from exc

        return PostingPhotoService._save_photo(posting, image_path, is_primary=is_primary)

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


class ModalidadeEntregaService:
    @staticmethod
    def list() -> QuerySet[ModalidadeEntrega]:
        return ModalidadeEntrega.objects.order_by("nome")
