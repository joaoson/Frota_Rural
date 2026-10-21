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


# Versão congelada em cada reserva; novos critérios não reinterpretam reservas antigas.
CANCELLATION_POLICY_VERSION = "2026-10-21"


def cancellation_quote(rental, actor, now=None, *, full_refund=False) -> dict:
    from decimal import Decimal, ROUND_HALF_UP

    now = now or timezone.now()
    is_admin = actor is not None and actor.role == UserRole.ADMIN
    is_owner = actor is not None and actor.pk == rental.postings.machinery.owner_id
    is_tenant = actor is not None and actor.pk == rental.lessee_id
    payments = list(rental.payments.all())
    paid = sum((p.amount for p in payments if p.status in ("approved", "partially_refunded", "refunded")), Decimal("0.00"))
    allowed, reason = True, "unpaid"
    if not (is_admin or is_owner or is_tenant or full_refund):
        allowed, reason = False, "not_a_party"
    elif rental.status in ("cancelled", "completed", "closed"):
        allowed, reason = False, "closed"
    elif rental.cancellation_policy_version != CANCELLATION_POLICY_VERSION:
        allowed, reason = False, "unknown_policy"
    elif rental.start_date <= now and not (is_admin or full_refund):
        allowed, reason = False, "already_started"
    elif any(p.status == "requires_review" for p in payments):
        allowed, reason = False, "payment_review"
    refund = paid
    if paid and allowed:
        if full_refund:
            reason = "signature_deadline"
        elif is_owner or is_admin:
            reason = "owner_or_admin"
        elif rental.start_date - now >= timedelta(days=7):
            reason = "seven_days_notice"
        else:
            reason = "late_tenant_cancellation"
            refund = (paid * Decimal("0.90")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    text = {
        "unpaid": "Reserva não paga: cancelamento sem custo.",
        "seven_days_notice": "Cancelamento com pelo menos 7 dias de antecedência: estorno integral.",
        "late_tenant_cancellation": "Cancelamento pelo locatário com menos de 7 dias: estorno de 90% e retenção de 10%.",
        "owner_or_admin": "Cancelamento pelo locador ou administrador: estorno integral ao locatário.",
        "signature_deadline": "Prazo de assinatura encerrado: cancelamento com estorno integral.",
        "already_started": "Após o início, o cancelamento deve ser tratado com a administração.",
        "closed": "Esta locação já foi encerrada.",
        "not_a_party": "Somente as partes ou a administração podem cancelar.",
        "payment_review": "Pagamento em análise. Aguarde a conciliação antes de cancelar.",
        "unknown_policy": "A política desta reserva precisa ser conferida pela administração.",
    }
    return {"allowed": allowed, "refund_amount": str(refund if allowed else Decimal("0.00")),
            "retained_amount": str(paid - refund if allowed else Decimal("0.00")),
            "reason_code": reason, "policy_text": text[reason], "policy_version": rental.cancellation_policy_version}
