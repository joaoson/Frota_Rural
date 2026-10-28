from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from django.db.models import Q, QuerySet
from django.utils import timezone

from postings.models import Postings
from rentals import lifecycle
from rentals.models import Rentals

STATUS_OCUPADOS = lifecycle.OCCUPYING
# Reservas ainda não pagas seguram o período só por alguns minutos.
STATUS_PROVISORIOS = lifecycle.PROVISIONAL
MINUTOS_DE_RESERVA = 30
INTERVALO_DE_LIMPEZA = timedelta(days=1)


def reservas_vigentes() -> QuerySet[Rentals]:
    """Reservations that currently occupy a machine, including unexpired holds."""
    now = timezone.now()
    limite = now - timedelta(minutes=MINUTOS_DE_RESERVA)
    return Rentals.objects.filter(
        Q(status__in=STATUS_OCUPADOS)
        | (Q(status__in=STATUS_PROVISORIOS) & (
            Q(reservation_expires_at__gt=now)
            | Q(reservation_expires_at__isnull=True, created_at__gte=limite)
        ))
    )


def reserva_retida(rental: Rentals) -> bool:
    """Whether an unpaid rental still holds its dates, by the rule above."""
    now = timezone.now()
    if rental.reservation_expires_at is not None:
        return rental.reservation_expires_at > now
    return rental.created_at is not None and rental.created_at >= now - timedelta(minutes=MINUTOS_DE_RESERVA)


def _reservas_vigentes(posting_id: UUID) -> QuerySet[Rentals]:
    # A machine may have several listings; a reservation occupies the machine,
    # not just the listing through which the tenant found it.
    machine_ids = Postings.objects.filter(pk=posting_id).values('machinery_id')
    return reservas_vigentes().filter(postings__machinery_id__in=machine_ids)


def reservas_em_conflito(inicio: datetime, fim: datetime) -> QuerySet[Rentals]:
    """Shared by booking validation and the public machine finder."""
    return reservas_vigentes().filter(
        start_date__lte=fim + INTERVALO_DE_LIMPEZA,
        end_date__gte=inicio - INTERVALO_DE_LIMPEZA,
    )


def periodos_ocupados(posting_id: UUID) -> list[dict[str, Any]]:
    rows = _reservas_vigentes(posting_id).values("id", "start_date", "end_date", "status")
    return [dict(row) for row in rows]


def tem_conflito(
    posting_id: UUID,
    inicio: datetime | None,
    fim: datetime | None,
    ignorar: UUID | None = None,
) -> bool:
    if not inicio or not fim:
        return False
    machine_ids = Postings.objects.filter(pk=posting_id).values("machinery_id")
    queryset = reservas_em_conflito(inicio, fim).filter(postings__machinery_id__in=machine_ids)
    if ignorar:
        queryset = queryset.exclude(id=ignorar)
    return queryset.exists()
