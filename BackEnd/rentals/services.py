from collections.abc import Mapping
from datetime import timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from django.db import transaction
from django.db.models import Q, QuerySet
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from common.exceptions import Conflict
from contracts.models import Contracts
from contracts.services import ContractService
from notifications.events import notify_rental_event
from payments.availability import MINUTOS_DE_RESERVA, tem_conflito
from payments.pricing import Cotacao, cotar
from postings.models import Postings
from rentals.enums import RentalStatus
from rentals.models import Rentals
from rentals.serializer import RentalFilterSerializer, RentalInputSerializer, validate_operator_assignment

PERIOD_CONFLICT_MESSAGE = (
    "O período selecionado conflita com uma reserva ou com o intervalo de limpeza da máquina."
)


class RentalService:
    @staticmethod
    def _queryset(user) -> QuerySet[Rentals]:
        return Rentals.objects.filter(
            Q(lessee=user) | Q(postings__machinery__owner=user)
        ).select_related("lessee", "postings__machinery__owner", "contracts")

    @staticmethod
    def get(rental_id: UUID, *, user) -> Rentals:
        try:
            return RentalService._queryset(user).get(id=rental_id)
        except Rentals.DoesNotExist as exc:
            raise NotFound("Locação não encontrada.") from exc

    @staticmethod
    def quote(posting: Postings, start_date, end_date) -> Cotacao:
        quote = cotar(posting, start_date, end_date)
        if not quote.total.is_finite() or quote.total <= 0 or quote.total > Decimal("99999999.99"):
            raise ValidationError("O anúncio precisa ter um preço válido para a reserva.")
        return quote

    @staticmethod
    @transaction.atomic
    def create(data: Mapping[str, Any], *, user) -> Rentals:
        serializer = RentalInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        if validated["lessee"].pk != user.pk:
            raise PermissionDenied("Você só pode criar reservas em seu próprio nome.")
        if validated.get("status", RentalStatus.PENDING) != RentalStatus.PENDING:
            raise ValidationError({"status": "Novas reservas precisam aguardar o pagamento."})
        if any(field in validated for field in ("initial_hour_meter", "final_hour_meter")):
            raise ValidationError("Leituras de horímetro não fazem parte de uma nova reserva.")
        # The same posting + machinery locks protect recurrence and checkout.
        posting = Postings.objects.select_for_update().select_related("machinery").get(pk=validated["postings"].pk)
        validated["postings"] = posting
        serializer.validate(validated)
        validated["operator"] = validate_operator_assignment(validated.get("operator"), user, lock=True)
        RentalService._ensure_period_available(posting, validated["start_date"], validated["end_date"])
        quote = RentalService.quote(posting, validated["start_date"], validated["end_date"])
        now = timezone.now()
        rental = serializer.save(
            id=uuid4(), status=RentalStatus.PENDING, **quote.snapshot(),
            created_at=now, updated_at=now,
            reservation_expires_at=now + timedelta(minutes=MINUTOS_DE_RESERVA),
        )
        contract = ContractService.create_for_rental(rental)
        notify_rental_event(rental, "rental_created", event_key=f"rental:{rental.pk}:created", contract=contract)
        return rental

    @staticmethod
    @transaction.atomic
    def update(rental_id: UUID, data: Mapping[str, Any], *, user, partial: bool = False) -> Rentals:
        reference = RentalService.get(rental_id, user=user)
        posting = Postings.objects.select_for_update().select_related("machinery").get(pk=reference.postings_id)
        # Avoid locking nullable outer joins from the output queryset.
        rental = Rentals.objects.select_for_update().get(pk=reference.pk)
        rental.postings = posting
        for field, current in (("lessee", rental.lessee_id), ("postings", rental.postings_id)):
            if field in data and str(data[field]) != str(current):
                raise ValidationError({field: "Este vínculo não pode ser alterado após a criação."})
        if "total_price" in data:
            raise ValidationError({"total_price": "O valor é calculado pelo servidor."})
        next_status = data.get("status", rental.status)
        if next_status != rental.status:
            cancellable = rental.status == RentalStatus.PENDING and not rental.payments.exclude(status="expired").exists()
            is_owner = user.pk == posting.machinery.owner_id
            if next_status == RentalStatus.COMPLETED and is_owner and rental.status == RentalStatus.ACTIVE:
                raise Conflict("A locação só pode ser concluída depois que as duas partes assinarem o contrato.")
            # Readings are usage metrics only: completion never depends on them.
            completable = is_owner and rental.status == RentalStatus.SIGNED and rental.end_date <= timezone.now()
            if not ((next_status == RentalStatus.CANCELLED and cancellable)
                    or (next_status == RentalStatus.COMPLETED and completable)):
                raise Conflict("Esta alteração exige o fluxo de pagamento ou assinatura correspondente.")
        if any(field in data for field in ("start_date", "end_date", "operator")):
            if user.pk != rental.lessee_id:
                raise PermissionDenied("Somente o locatário pode alterar os dados de uma reserva pendente.")
            if rental.status != RentalStatus.PENDING or rental.payments.exclude(status="expired").exists():
                raise Conflict("Uma reserva em pagamento ou confirmada não pode ter seus dados alterados.")
        if any(field in data for field in ("initial_hour_meter", "final_hour_meter")):
            if user.pk != posting.machinery.owner_id or rental.status not in (RentalStatus.ACTIVE, RentalStatus.SIGNED):
                raise PermissionDenied("Somente o locador pode registrar leituras de uma reserva confirmada.")
        serializer = RentalInputSerializer(rental, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        if any(field in validated for field in ("operator", "start_date", "end_date")):
            validated["operator"] = validate_operator_assignment(
                validated.get("operator", rental.operator), rental.lessee, lock=True,
            )
        previous_status = rental.status
        changed = any(getattr(rental, field) != value for field, value in validated.items())
        save_fields = {"updated_at": timezone.now()}
        # A status/meter-only change remains possible after an unpaid hold expires.
        if any(field in validated for field in ("start_date", "end_date")):
            start = validated.get("start_date", rental.start_date)
            end = validated.get("end_date", rental.end_date)
            RentalService._ensure_period_available(posting, start, end, ignore_rental_id=rental.pk)
            # Only an unpaid pending booking reaches this point (checked above).
            # The agreed price changes only when the tenant picks other dates.
            if (start, end) != (rental.start_date, rental.end_date):
                quote = RentalService.quote(posting, start, end)
                save_fields.update(quote.snapshot())
                changed = changed or rental.total_price != quote.total
        rental = serializer.save(**save_fields)
        if previous_status != rental.status and rental.status == RentalStatus.CANCELLED:
            Contracts.objects.filter(rental=rental).update(status="cancelled")
            rental._state.fields_cache.pop("contracts", None)
        if changed:
            event = "rental_updated"
            if rental.status != previous_status and rental.status in (RentalStatus.CANCELLED, RentalStatus.COMPLETED):
                event = f"rental_{rental.status}"
            event_key = f"rental:{rental.pk}:{event}"
            if event == "rental_updated":
                event_key += f":{uuid4()}"
            notify_rental_event(rental, event, event_key=event_key)
        return rental

    @staticmethod
    def delete(rental_id: UUID, *, user) -> None:
        RentalService.get(rental_id, user=user)
        raise Conflict("Cancele a reserva para preservar seu histórico e contrato.", code="has_dependents")

    @staticmethod
    def _ensure_period_available(posting, start_date, end_date, *, ignore_rental_id=None) -> None:
        if tem_conflito(posting.pk, start_date, end_date, ignorar=ignore_rental_id):
            raise ValidationError({"non_field_errors": [PERIOD_CONFLICT_MESSAGE]})

    @staticmethod
    def list(filters: Mapping[str, Any], *, user) -> QuerySet[Rentals]:
        serializer = RentalFilterSerializer(data=filters)
        serializer.is_valid(raise_exception=True)
        params = serializer.validated_data
        queryset = RentalService._queryset(user).order_by("-created_at", "-id")
        if "postings" in params:
            queryset = queryset.filter(postings_id=params["postings"])
        if "lessee" in params:
            queryset = queryset.filter(lessee_id=params["lessee"])
        if "lessor" in params:
            queryset = queryset.filter(postings__machinery__owner_id=params["lessor"])
        return queryset
