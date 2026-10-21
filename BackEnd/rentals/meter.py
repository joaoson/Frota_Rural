"""Leituras do horímetro da locação: só métricas de uso (ADR 0002, fase 3 do plano).

Nada aqui altera preço, pagamento ou estorno, e a conclusão não depende das
leituras. As regras só garantem que os números façam sentido: valores entre 0 e
60.000 h, devolução nunca menor que a retirada, registro pelo locador enquanto a
locação assinada está em andamento.
"""

import uuid
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from uuid import UUID

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from common.exceptions import Conflict
from machines.models import Machines
from machines.serializer import HOUR_METER_MAX
from notifications.events import notify_rental_event
from payments.pricing import HORAS_POR_DIARIA, calcular_diarias
from postings.models import Postings
from rentals import lifecycle
from rentals.enums import MeterReadingKind, RentalStatus
from rentals.models import RentalMeterReadings, Rentals

MACHINE_HOUR_METER_WARNING = (
    "A leitura informada é menor que o horímetro cadastrado da máquina ({hours} h). Confira o painel."
)


class MeterReadingInputSerializer(serializers.Serializer[Any]):
    kind = serializers.ChoiceField(choices=MeterReadingKind.choices, help_text="`check_in` (retirada) ou `check_out` (devolução).")
    value = serializers.IntegerField(min_value=0, max_value=HOUR_METER_MAX, help_text="Leitura do painel, em horas.")
    note = serializers.CharField(required=False, allow_blank=True, max_length=500, default="")


@dataclass(frozen=True)
class MeterRecord:
    reading: RentalMeterReadings
    warnings: tuple[str, ...]


def latest_readings(readings: Iterable[RentalMeterReadings]) -> dict[str, RentalMeterReadings]:
    """A leitura vigente de cada tipo (a mais recente); aceita a lista prefetchada."""
    latest: dict[str, RentalMeterReadings] = {}
    for reading in sorted(readings, key=lambda r: (r.recorded_at, str(r.id))):
        latest[reading.kind] = reading
    return latest


def usage_summary(rental: Rentals) -> dict[str, Any]:
    """Uso registrado de uma locação, ao lado da referência de 8 h por diária."""
    latest = latest_readings(rental.meter_readings.all())
    check_in, check_out = latest.get(MeterReadingKind.CHECK_IN), latest.get(MeterReadingKind.CHECK_OUT)
    days = rental.billable_days or calcular_diarias(rental.start_date, rental.end_date)
    return {
        "check_in": _reading_payload(check_in),
        "check_out": _reading_payload(check_out),
        "hours_used": check_out.value - check_in.value if check_in and check_out else None,
        "reference_hours": HORAS_POR_DIARIA * days if days else None,
    }


def _reading_payload(reading: RentalMeterReadings | None) -> dict[str, Any] | None:
    if reading is None:
        return None
    return {
        "id": str(reading.id),
        "value": reading.value,
        "note": reading.note,
        "recorded_at": reading.recorded_at.isoformat(),
        "recorded_by": str(reading.recorded_by_id),
    }


class MeterService:
    @staticmethod
    @transaction.atomic
    def record(rental_id: UUID, data: Mapping[str, Any], *, user) -> MeterRecord:
        serializer = MeterReadingInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        kind: str = serializer.validated_data["kind"]
        value: int = serializer.validated_data["value"]

        reference = Rentals.objects.filter(
            Q(lessee=user) | Q(postings__machinery__owner=user), pk=rental_id,
        ).first()
        if reference is None:
            raise NotFound("Locação não encontrada.")
        # Same lock order as booking, payment and signing.
        posting = Postings.objects.select_for_update().select_related("machinery").get(pk=reference.postings_id)
        rental = Rentals.objects.select_for_update().get(pk=reference.pk)
        rental.postings = posting
        if user.pk != posting.machinery.owner_id:
            raise PermissionDenied("Somente o locador registra as leituras do horímetro.")
        if rental.status != RentalStatus.SIGNED:
            raise Conflict(
                "As leituras são registradas depois que as duas partes assinam o contrato e antes da conclusão."
            )
        if timezone.now().date() < rental.start_date.date():
            raise Conflict("A leitura de retirada só pode ser registrada a partir do primeiro dia da locação.")

        latest = latest_readings(rental.meter_readings.all())
        check_in, check_out = latest.get(MeterReadingKind.CHECK_IN), latest.get(MeterReadingKind.CHECK_OUT)
        if kind == MeterReadingKind.CHECK_OUT:
            if check_in is None:
                raise ValidationError({"kind": "Registre a leitura de retirada antes da devolução."})
            if value < check_in.value:
                raise ValidationError({"value": "A leitura de devolução não pode ser menor que a de retirada."})
        elif check_out is not None and value > check_out.value:
            raise ValidationError({"value": "A leitura de retirada não pode ser maior que a de devolução."})

        now = timezone.now()
        reading = RentalMeterReadings.objects.create(
            id=uuid.uuid4(), rental=rental, kind=kind, value=value,
            note=serializer.validated_data["note"].strip(), recorded_by=user, recorded_at=now,
            supersedes=latest.get(kind),
        )
        field = "initial_hour_meter" if kind == MeterReadingKind.CHECK_IN else "final_hour_meter"
        setattr(rental, field, value)
        rental.updated_at = now
        rental.save(update_fields=[field, "updated_at"])
        notify_rental_event(rental, f"meter_{kind}_recorded", event_key=f"meter:{reading.pk}")

        warnings: list[str] = []
        machine = posting.machinery
        if kind == MeterReadingKind.CHECK_IN and machine.hour_meter is not None and value < machine.hour_meter:
            warnings.append(MACHINE_HOUR_METER_WARNING.format(hours=machine.hour_meter))
        return MeterRecord(reading=reading, warnings=tuple(warnings))

    @staticmethod
    def readings(rental_id: UUID, *, user) -> list[RentalMeterReadings]:
        rental = Rentals.objects.filter(
            Q(lessee=user) | Q(postings__machinery__owner=user), pk=rental_id,
        ).first()
        if rental is None:
            raise NotFound("Locação não encontrada.")
        return list(rental.meter_readings.order_by("recorded_at", "id"))

    @staticmethod
    def machine_usage(machine_id: UUID, *, user) -> dict[str, Any]:
        """Uso acumulado da máquina nas locações concluídas, para o painel do locador."""
        machine = Machines.objects.filter(pk=machine_id, owner=user).first()
        if machine is None:
            raise NotFound("Máquina não encontrada.")
        rentals = list(
            Rentals.objects.filter(postings__machinery=machine, status__in=lifecycle.FINISHED)
            .prefetch_related("meter_readings")
        )
        days = hours = measured_days = measured = 0
        for rental in rentals:
            summary = usage_summary(rental)
            rental_days = rental.billable_days or calcular_diarias(rental.start_date, rental.end_date)
            days += rental_days
            if summary["hours_used"] is not None:
                measured += 1
                hours += summary["hours_used"]
                measured_days += rental_days
        last = (RentalMeterReadings.objects.filter(rental__postings__machinery=machine)
                .order_by("-recorded_at", "-id").first())
        average = (
            str((Decimal(hours) / measured_days).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))
            if measured_days else None
        )
        return {
            "locacoes_concluidas": len(rentals),
            "diarias": days,
            "locacoes_com_leitura": measured,
            "horas_registradas": hours,
            "media_horas_por_diaria": average,
            "referencia_horas_por_diaria": HORAS_POR_DIARIA,
            "ultima_leitura": (
                {"valor": last.value, "registrada_em": last.recorded_at.isoformat()} if last else None
            ),
        }
