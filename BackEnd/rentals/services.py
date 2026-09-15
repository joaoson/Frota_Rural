from collections.abc import Mapping
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from django.db import IntegrityError, transaction
from django.db.models import QuerySet
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from common.db import enforce_constraints_now
from common.exceptions import Conflict
from contracts.services import ContractService
from postings.models import Postings
from rentals.enums import RentalStatus
from rentals.models import Rentals
from rentals.serializer import RentalFilterSerializer, RentalInputSerializer

# Dia livre antes e depois de cada locação para limpeza e transporte da máquina.
CLEANING_BUFFER = timedelta(days=1)

# Locações que ocupam o período do anúncio na hora de aceitar uma nova reserva.
PERIOD_BLOCKING_STATUSES = (RentalStatus.PENDING, RentalStatus.ACTIVE, RentalStatus.SIGNED)

PERIOD_CONFLICT_MESSAGE = (
    "O período selecionado conflita com uma reserva ou com o intervalo de limpeza da máquina."
)


class RentalService:
    @staticmethod
    def _queryset() -> QuerySet[Rentals]:
        return Rentals.objects.select_related("lessee", "postings__machinery__owner", "contracts")

    @staticmethod
    def get(rental_id: UUID) -> Rentals:
        try:
            return RentalService._queryset().get(id=rental_id)
        except Rentals.DoesNotExist as exc:
            raise NotFound("Locação não encontrada.") from exc

    @staticmethod
    @transaction.atomic
    def create(data: Mapping[str, Any]) -> Rentals:
        """Cria a reserva e o contrato dela na mesma transação."""
        serializer = RentalInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        validated: dict[str, Any] = serializer.validated_data

        RentalService._ensure_period_available(
            validated["postings"], validated["start_date"], validated["end_date"]
        )

        now = timezone.now()
        rental = serializer.save(
            id=uuid4(),
            status=validated.get("status") or RentalStatus.PENDING,
            created_at=now,
            updated_at=now,
        )
        ContractService.create_for_rental(rental)
        return rental

    @staticmethod
    @transaction.atomic
    def update(rental_id: UUID, data: Mapping[str, Any], *, partial: bool = False) -> Rentals:
        rental = RentalService.get(rental_id)
        serializer = RentalInputSerializer(rental, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        validated: dict[str, Any] = serializer.validated_data

        RentalService._ensure_period_available(
            validated.get("postings", rental.postings),
            validated.get("start_date", rental.start_date),
            validated.get("end_date", rental.end_date),
            ignore_rental_id=rental.id,
        )
        return serializer.save(updated_at=timezone.now())

    @staticmethod
    @transaction.atomic
    def delete(rental_id: UUID) -> None:
        rental = RentalService.get(rental_id)
        enforce_constraints_now()
        try:
            rental.delete()
        except IntegrityError as exc:
            raise Conflict(
                "Não é possível excluir esta locação: existem registros dependentes (ex.: contrato).",
                code="has_dependents",
            ) from exc

    @staticmethod
    def _ensure_period_available(
        posting: Postings,
        start_date: datetime,
        end_date: datetime,
        *,
        ignore_rental_id: UUID | None = None,
    ) -> None:
        """Mantém um dia livre antes e depois de cada reserva do anúncio."""
        # Trava o anúncio até o fim da transação: duas reservas simultâneas do
        # mesmo período não podem passar juntas por esta checagem.
        Postings.objects.select_for_update().only("id").get(pk=posting.pk)

        conflicts = Rentals.objects.filter(
            postings=posting,
            status__in=PERIOD_BLOCKING_STATUSES,
            start_date__lte=end_date + CLEANING_BUFFER,
            end_date__gte=start_date - CLEANING_BUFFER,
        )
        if ignore_rental_id is not None:
            conflicts = conflicts.exclude(pk=ignore_rental_id)
        if conflicts.exists():
            raise ValidationError({"non_field_errors": [PERIOD_CONFLICT_MESSAGE]})

    @staticmethod
    def list(filters: Mapping[str, Any]) -> QuerySet[Rentals]:
        serializer = RentalFilterSerializer(data=filters)
        serializer.is_valid(raise_exception=True)
        params: dict[str, Any] = serializer.validated_data

        queryset = RentalService._queryset().order_by("-created_at", "-id")
        if "postings" in params:
            queryset = queryset.filter(postings_id=params["postings"])
        if "lessee" in params:
            queryset = queryset.filter(lessee_id=params["lessee"])
        if "lessor" in params:
            queryset = queryset.filter(postings__machinery__owner_id=params["lessor"])
        return queryset
