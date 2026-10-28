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
from payments.enums import OPEN_PAYMENT_STATUSES
from payments.pricing import Cotacao, cotar
from postings.models import Postings
from rentals import policy
from rentals.enums import MeterReadingKind, RentalStatus
from rentals.meter import MeterService
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
        ).select_related("lessee", "postings__machinery__owner", "contracts").prefetch_related(
            "payments", "meter_readings",
        )

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
        if any(field in data for field in ("initial_hour_meter", "final_hour_meter")):
            raise ValidationError("Leituras de horímetro não fazem parte de uma nova reserva.")
        # The same posting + machinery locks protect recurrence and checkout.
        posting = Postings.objects.select_for_update().select_related("machinery").get(pk=validated["postings"].pk)
        validated["postings"] = posting
        policy.ensure_can_book(user, posting)
        serializer.validate(validated)
        policy.ensure_lead_time(validated["start_date"])
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
        if "status" in data:
            raise Conflict("Use /api/rentals/<id>/cancel para cancelar ou /complete para concluir.", code="use_rental_action")
        if any(field in data for field in ("start_date", "end_date", "operator")):
            if user.pk != rental.lessee_id:
                raise PermissionDenied("Somente o locatário pode alterar os dados de uma reserva pendente.")
            if rental.status != RentalStatus.PENDING or rental.payments.filter(status__in=OPEN_PAYMENT_STATUSES).exists():
                raise Conflict("Uma reserva em pagamento ou confirmada não pode ter seus dados alterados.")
        if any(field in data for field in ("initial_hour_meter", "final_hour_meter")):
            raise ValidationError({"detail": (
                "Registre as leituras do horímetro em /api/rentals/<id>/meter-readings: "
                "elas são validadas e ficam no histórico da locação."
            )})
        if "notes" in data:
            if user.pk != rental.lessee_id:
                raise PermissionDenied("Somente o locatário pode alterar as observações da reserva.")
            if rental.status in (RentalStatus.CANCELLED, RentalStatus.COMPLETED, RentalStatus.CLOSED):
                raise Conflict("As observações de uma locação encerrada não podem ser alteradas.")
        serializer = RentalInputSerializer(rental, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        if any(field in validated for field in ("operator", "start_date", "end_date")):
            validated["operator"] = validate_operator_assignment(
                validated.get("operator", rental.operator), rental.lessee, lock=True,
            )
        changed = any(getattr(rental, field) != value for field, value in validated.items())
        save_fields = {"updated_at": timezone.now()}
        if any(field in validated for field in ("start_date", "end_date")):
            start = validated.get("start_date", rental.start_date)
            end = validated.get("end_date", rental.end_date)
            RentalService._ensure_period_available(posting, start, end, ignore_rental_id=rental.pk)
            # Only an unpaid pending booking reaches this point (checked above).
            # The agreed price changes only when the tenant picks other dates.
            if (start, end) != (rental.start_date, rental.end_date):
                policy.ensure_lead_time(start)
                quote = RentalService.quote(posting, start, end)
                save_fields.update(quote.snapshot())
                changed = changed or rental.total_price != quote.total
        rental = serializer.save(**save_fields)
        if changed:
            notify_rental_event(rental, "rental_updated", event_key=f"rental:{rental.pk}:rental_updated:{uuid4()}")
        return rental

    @staticmethod
    @transaction.atomic
    def complete(rental_id: UUID, data: Mapping[str, Any], *, user) -> Rentals:
        reference = RentalService.get(rental_id, user=user)
        posting = Postings.objects.select_related("machinery").select_for_update(of=("self", "machinery")).get(pk=reference.postings_id)
        rental = Rentals.objects.select_for_update().get(pk=rental_id)
        rental.postings = posting
        contract = Contracts.objects.select_for_update().filter(rental=rental).first()
        if user.pk != posting.machinery.owner_id:
            raise PermissionDenied("Somente o locador pode concluir a locação.")
        if rental.status == RentalStatus.COMPLETED:
            return rental
        if rental.status != RentalStatus.SIGNED or not contract or contract.status != "signed" or not (contract.accepted_by_lessor and contract.accepted_by_lessee) or rental.end_date > timezone.now():
            raise Conflict("A conclusão exige as duas assinaturas e o fim do período contratado.")
        if data.get("final_hour_meter") not in (None, ""):
            MeterService.record(rental_id, {
                "kind": MeterReadingKind.CHECK_OUT, "value": data["final_hour_meter"], "note": data.get("note", ""),
            }, user=user)
            rental.refresh_from_db()
        rental.status = RentalStatus.COMPLETED
        rental.updated_at = timezone.now()
        rental.save(update_fields=["status", "updated_at"])
        notify_rental_event(rental, "rental_completed", event_key=f"rental:{rental.pk}:rental_completed")
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
