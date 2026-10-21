"""Regras de reserva comuns à reserva avulsa, à troca de datas e à recorrência (passo 4.3)."""

from datetime import date, datetime, timedelta

from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from users.enums import UserRole

# Antecedência mínima entre hoje e o primeiro dia da locação. Antes só a tela de
# reserva aplicava esta regra; a API e a recorrência aceitavam o dia seguinte.
ANTECEDENCIA_MINIMA_DIAS = 7
BOOKING_ROLES = (UserRole.LESSEE, UserRole.ADMIN)


def earliest_start_date(today: date | None = None) -> date:
    return (today or timezone.localdate()) + timedelta(days=ANTECEDENCIA_MINIMA_DIAS)


def ensure_lead_time(start: datetime | date, *, field: str = "start_date") -> None:
    earliest = earliest_start_date()
    day = start.date() if isinstance(start, datetime) else start
    if day < earliest:
        raise ValidationError({field: (
            f"A locação precisa começar a partir de {earliest:%d/%m/%Y} "
            f"({ANTECEDENCIA_MINIMA_DIAS} dias de antecedência)."
        )})


def ensure_can_book(user, posting) -> None:
    """Quem reserva é locatário (ou admin) e nunca o dono da máquina."""
    if user.role not in BOOKING_ROLES:
        raise PermissionDenied("Somente locatários podem reservar maquinário.")
    if posting.machinery.owner_id == user.pk:
        raise PermissionDenied("Você não pode reservar a sua própria máquina.")
