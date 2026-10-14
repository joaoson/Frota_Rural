from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from django.db.models import Q, QuerySet
from django.utils import timezone

from postings.models import Postings
from rentals.enums import RentalStatus
from rentals.models import Rentals

STATUS_OCUPADOS = (
    RentalStatus.ACTIVE,
    RentalStatus.SIGNED,
    RentalStatus.COMPLETED,
    RentalStatus.CLOSED,
)
# Reservas ainda não pagas seguram o período só por alguns minutos.
STATUS_PROVISORIOS = (RentalStatus.PENDING, RentalStatus.AWAITING_PAYMENT)
MINUTOS_DE_RESERVA = 30
INTERVALO_DE_LIMPEZA = timedelta(days=1)


def _reservas_vigentes(posting_id: UUID) -> QuerySet[Rentals]:
    now = timezone.now()
    limite = now - timedelta(minutes=MINUTOS_DE_RESERVA)
    # A machine may have several listings; a reservation occupies the machine,
    # not just the listing through which the tenant found it.
    machine_ids = Postings.objects.filter(pk=posting_id).values('machinery_id')
    return Rentals.objects.filter(postings__machinery_id__in=machine_ids).filter(
        Q(status__in=STATUS_OCUPADOS)
        | (Q(status__in=STATUS_PROVISORIOS) & (
            Q(reservation_expires_at__gt=now)
            | Q(reservation_expires_at__isnull=True, created_at__gte=limite)
        ))
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
    queryset = _reservas_vigentes(posting_id).filter(
        start_date__lte=fim + INTERVALO_DE_LIMPEZA,
        end_date__gte=inicio - INTERVALO_DE_LIMPEZA,
    )
    if ignorar:
        queryset = queryset.exclude(id=ignorar)
    return queryset.exists()
