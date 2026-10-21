"""Conciliação com o Stripe para o que o webhook e a resposta síncrona não fecharam (passo 2.1).

Seguro para rodar repetidamente: cada passo reusa a mesma chave de idempotência
ou só lê o estado no Stripe, e as transições locais já são idempotentes.
"""

import logging
from dataclasses import dataclass, field
from datetime import timedelta

import stripe
from django.utils import timezone

from payments.enums import PaymentStatus
from payments.models import Payments
from payments.services import DEFINITIVE_ERRORS, PaymentService, _get, _stripe
from rentals import lifecycle

logger = logging.getLogger(__name__)


@dataclass
class ReconcileReport:
    attached: int = 0
    failed: int = 0
    uncertain: int = 0
    expired: int = 0
    approved: int = 0
    refunds_checked: int = 0
    requires_review: list[str] = field(default_factory=list)


def reconcile_payments(*, grace: timedelta = timedelta(minutes=2)) -> ReconcileReport:
    report = ReconcileReport()
    provider = _stripe()
    cutoff = timezone.now() - grace

    # 1. Attempts whose answer was lost: replay the same key and parameters.
    for attempt in Payments.objects.filter(status=PaymentStatus.CREATING, updated_at__lt=cutoff).select_related("rental"):
        try:
            session = provider.checkout.Session.create(**attempt.provider_request, idempotency_key=attempt.idempotency_key)
        except DEFINITIVE_ERRORS as exc:
            PaymentService._attempt_failed(attempt.pk, exc)
            report.failed += 1
            continue
        except stripe.StripeError as exc:
            logger.warning("Tentativa %s continua incerta: %s", attempt.pk, exc)
            report.uncertain += 1
            continue
        if attempt.rental.status in lifecycle.PROVISIONAL:
            from common.exceptions import Conflict
            try:
                PaymentService._attach_session(attempt.pk, session)
                report.attached += 1
            except Conflict:
                report.uncertain += 1
        else:
            outcome = PaymentService.close_cancelled_checkout(attempt.pk, session.id)
            setattr(report, outcome, getattr(report, outcome) + 1)

    # 2. Open sessions whose webhook never arrived.
    for payment in Payments.objects.filter(status=PaymentStatus.PENDING, updated_at__lt=cutoff).exclude(session_id=None):
        if payment.rental.status == "cancelled":
            outcome = PaymentService.close_cancelled_checkout(payment.pk, payment.session_id)
            setattr(report, outcome, getattr(report, outcome) + 1)
            continue
        try:
            session = provider.checkout.Session.retrieve(payment.session_id)
        except stripe.StripeError as exc:
            logger.warning("Sessão %s não pôde ser consultada: %s", payment.session_id, exc)
            report.uncertain += 1
            continue
        if _get(session, "status") == "complete" and _get(session, "payment_status") == "paid":
            PaymentService._approve(payment.session_id, payment_intent=_get(session, "payment_intent"))
            report.approved += 1
        elif _get(session, "status") == "expired":
            PaymentService._expire(payment.session_id)
            report.expired += 1

    from payments.refunds import reconcile_refunds
    report.refunds_checked = reconcile_refunds()

    # 3. Paid but unavailable bookings stay for a person to resolve.
    report.requires_review = [
        str(pk) for pk in Payments.objects.filter(status=PaymentStatus.REQUIRES_REVIEW).values_list("pk", flat=True)
    ]
    return report
