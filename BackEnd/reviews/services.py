from collections.abc import Mapping
from typing import Any
from uuid import UUID, uuid4

from django.db import IntegrityError, transaction
from django.db.models import QuerySet
from django.utils import timezone
from rest_framework.exceptions import NotFound

from common.db import enforce_constraints_now
from common.exceptions import Conflict
from reviews.models import Reviews
from reviews.serializer import (
    DUPLICATE_REVIEW_MESSAGE,
    ReviewFilterSerializer,
    ReviewInputSerializer,
)


class ReviewService:
    @staticmethod
    def _queryset() -> QuerySet[Reviews]:
        return Reviews.objects.select_related("reviewer", "reviewee")

    @staticmethod
    def get(review_id: UUID) -> Reviews:
        try:
            return ReviewService._queryset().get(id=review_id)
        except Reviews.DoesNotExist as exc:
            raise NotFound("Avaliação não encontrada.") from exc

    @staticmethod
    @transaction.atomic
    def create(data: Mapping[str, Any]) -> Reviews:
        serializer = ReviewInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        try:
            return serializer.save(id=uuid4(), created_at=timezone.now())
        except IntegrityError as exc:
            # O validador do serializer já cobre a duplicidade; aqui sobra a
            # corrida entre duas requisições simultâneas.
            raise Conflict(DUPLICATE_REVIEW_MESSAGE, code="already_reviewed") from exc

    @staticmethod
    @transaction.atomic
    def update(review_id: UUID, data: Mapping[str, Any], *, partial: bool = False) -> Reviews:
        review = ReviewService.get(review_id)
        serializer = ReviewInputSerializer(review, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        try:
            return serializer.save()
        except IntegrityError as exc:
            raise Conflict(DUPLICATE_REVIEW_MESSAGE, code="already_reviewed") from exc

    @staticmethod
    @transaction.atomic
    def delete(review_id: UUID) -> None:
        review = ReviewService.get(review_id)
        enforce_constraints_now()
        try:
            review.delete()
        except IntegrityError as exc:
            raise Conflict(
                "Não é possível excluir esta avaliação: ela está referenciada em outro registro.",
                code="has_dependents",
            ) from exc

    @staticmethod
    def list(filters: Mapping[str, Any]) -> QuerySet[Reviews]:
        serializer = ReviewFilterSerializer(data=filters)
        serializer.is_valid(raise_exception=True)
        params: dict[str, Any] = serializer.validated_data

        queryset = ReviewService._queryset().order_by("-created_at", "-id")
        if "reviewee" in params:
            queryset = queryset.filter(reviewee_id=params["reviewee"])
        if "reviewer" in params:
            queryset = queryset.filter(reviewer_id=params["reviewer"])
        if "rental" in params:
            queryset = queryset.filter(rental_id=params["rental"])
        return queryset
