from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from api.models import Rentals
from postings.models import Postings

STATUS_OCUPADOS = ('active', 'signed', 'completed', 'closed')
STATUS_PROVISORIOS = ('pending', 'awaiting_payment')
MINUTOS_DE_RESERVA = 30
INTERVALO_DE_LIMPEZA = timedelta(days=1)


def _reservas_vigentes(posting_id):
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


def periodos_ocupados(posting_id):
    return list(
        _reservas_vigentes(posting_id).values('id', 'start_date', 'end_date', 'status')
    )


def tem_conflito(posting_id, inicio, fim, ignorar=None):
    if not inicio or not fim:
        return False
    qs = _reservas_vigentes(posting_id).filter(
        start_date__lte=fim + INTERVALO_DE_LIMPEZA,
        end_date__gte=inicio - INTERVALO_DE_LIMPEZA,
    )
    if ignorar:
        qs = qs.exclude(id=ignorar)
    return qs.exists()
