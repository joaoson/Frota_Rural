from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from api.models import Rentals

STATUS_OCUPADOS = ('active', 'signed', 'completed', 'closed')
STATUS_PROVISORIOS = ('pending', 'awaiting_payment')
MINUTOS_DE_RESERVA = 30


def _reservas_vigentes(posting_id):
    limite = timezone.now() - timedelta(minutes=MINUTOS_DE_RESERVA)
    return Rentals.objects.filter(postings_id=posting_id).filter(
        Q(status__in=STATUS_OCUPADOS)
        | Q(status__in=STATUS_PROVISORIOS, created_at__gte=limite)
    )


def periodos_ocupados(posting_id):
    return list(
        _reservas_vigentes(posting_id).values('id', 'start_date', 'end_date', 'status')
    )


def tem_conflito(posting_id, inicio, fim, ignorar=None):
    if not inicio or not fim:
        return False
    qs = _reservas_vigentes(posting_id).filter(
        start_date__lte=fim, end_date__gte=inicio
    )
    if ignorar:
        qs = qs.exclude(id=ignorar)
    return qs.exists()
