"""Estornos com obrigação local e tentativas duráveis; chamadas externas fora dos locks."""
import logging
from datetime import timedelta

import stripe
from django.core.exceptions import ValidationError as InvalidIdentifier
from django.db import transaction
from django.utils import timezone

from common.exceptions import ServiceUnavailable
from notifications.events import notify_rental_event
from payments.enums import PaymentStatus, RefundStatus
from payments.models import Payments, RefundAttempts, Refunds

logger = logging.getLogger(__name__)


def _provider():
    # Import tardio: aprovação de pagamentos também agenda estornos de pagamentos tardios.
    from payments.services import _stripe
    return _stripe()


class RefundService:
    @staticmethod
    def request(payment, amount, *, reason, user=None):
        refund, created = Refunds.objects.get_or_create(payment=payment, defaults={
            "amount": amount, "idempotency_key": f"refund:{payment.pk}:cancellation",
            "reason": reason, "requested_by": user,
        })
        if created:
            notify_rental_event(payment.rental, "refund_pending", event_key=f"refund:{refund.pk}:pending")
        return refund

    @staticmethod
    @transaction.atomic
    def _prepare(refund_id):
        reference = Refunds.objects.get(pk=refund_id)
        payment = Payments.objects.select_for_update(of=("self",)).select_related("rental").get(pk=reference.payment_id)
        refund = Refunds.objects.select_for_update().get(pk=refund_id)
        if refund.status in (RefundStatus.SUCCEEDED, RefundStatus.CANCELED):
            return refund, None, payment
        last = refund.attempts.order_by("-number").first()
        # Somente a confirmação terminal do Stripe autoriza uma nova chave.
        # Timeout/erro local mantém a tentativa pendente e reusa os parâmetros.
        if last is None or (last.status == RefundStatus.FAILED and last.provider_refund_id):
            number = last.number + 1 if last else 1
            last = RefundAttempts.objects.create(refund=refund, number=number,
                                                idempotency_key=f"{refund.idempotency_key}:{number}")
        return refund, last, payment

    @staticmethod
    def process(refund_id):
        from payments.services import _get

        refund, attempt, payment = RefundService._prepare(refund_id)
        if attempt is None:
            return
        try:
            provider = _provider()
            if attempt.provider_refund_id:
                result = provider.Refund.retrieve(attempt.provider_refund_id)
            else:
                intent = payment.payment_intent_id
                if not intent and payment.session_id:
                    session = provider.checkout.Session.retrieve(payment.session_id)
                    intent = _get(session, "payment_intent")
                    if intent:
                        Payments.objects.filter(pk=payment.pk).update(payment_intent_id=intent)
                if not intent:
                    raise ValueError("Pagamento sem identificador de cobrança. A conciliação precisa recuperá-lo.")
                # O Stripe pode esquecer uma chave depois de 24 h. Antes disso,
                # respostas perdidas repetem a chave; depois, só recuperamos evidência.
                if attempt.created_at < timezone.now() - timedelta(hours=23):
                    matches = provider.Refund.list(payment_intent=intent, limit=100).auto_paging_iter()
                    result = next((item for item in matches if _get(_get(item, "metadata") or {}, "attempt_id") == str(attempt.pk)), None)
                    if result is None:
                        raise ValueError("Tentativa antiga sem confirmação: revisão manual necessária antes de reenviar o estorno.")
                else:
                    result = provider.Refund.create(
                        payment_intent=intent, amount=int(refund.amount * 100),
                        reason="requested_by_customer",
                        metadata={"refund_id": str(refund.pk), "attempt_id": str(attempt.pk)},
                        idempotency_key=attempt.idempotency_key,
                    )
            RefundService.apply(result, attempt_id=attempt.pk)
        except (stripe.StripeError, ServiceUnavailable, ValueError) as exc:
            RefundService.failed(refund_id, attempt.pk, str(exc))
            logger.warning("Estorno %s aguardando conciliação: %s", refund_id, exc)

    @staticmethod
    @transaction.atomic
    def failed(refund_id, attempt_id, error):
        refund = Refunds.objects.select_for_update().get(pk=refund_id)
        # Uma resposta de erro tardia nunca apaga um webhook de sucesso.
        if refund.status in (RefundStatus.SUCCEEDED, RefundStatus.CANCELED):
            return
        if refund.attempts.order_by("-number").first().pk != attempt_id:
            return
        refund.status = RefundStatus.FAILED
        refund.last_error = error[:1000]
        refund.save(update_fields=["status", "last_error", "updated_at"])
        notify_rental_event(refund.payment.rental, "refund_failed", event_key=f"refund:{refund.pk}:failed:{attempt_id}")

    @staticmethod
    @transaction.atomic
    def apply(result, *, attempt_id=None):
        from payments.services import _get

        provider_id = _get(result, "id")
        if not provider_id:
            raise ValueError("O provedor não confirmou o identificador do estorno.")
        reference = RefundAttempts.objects.filter(provider_refund_id=provider_id).first()
        if reference is None and attempt_id:
            try:
                reference = RefundAttempts.objects.filter(pk=attempt_id).first()
            except (ValueError, TypeError, InvalidIdentifier):
                return
        if reference is None:
            return
        payment = Payments.objects.select_for_update().get(pk=reference.refund.payment_id)
        refund = Refunds.objects.select_for_update().get(pk=reference.refund_id)
        attempt = RefundAttempts.objects.select_for_update().get(pk=reference.pk)
        if attempt.provider_refund_id not in (None, provider_id):
            raise ValueError("O estorno retornado não corresponde à tentativa gravada.")
        if _get(result, "amount") != int(refund.amount * 100):
            raise ValueError("O valor confirmado pelo provedor difere do estorno solicitado.")
        status = _get(result, "status", RefundStatus.PENDING)
        if status not in RefundStatus.values:
            status = RefundStatus.PENDING  # requires_action continua pendente, sem repetir a cobrança
        # Resultados terminais nunca retrocedem por respostas atrasadas.
        if attempt.status in (RefundStatus.SUCCEEDED, RefundStatus.FAILED, RefundStatus.CANCELED):
            status = attempt.status
        attempt.provider_refund_id, attempt.status = provider_id, status
        attempt.save(update_fields=["provider_refund_id", "status"])
        if refund.attempts.order_by("-number").first().pk != attempt.pk:
            return
        refund.provider_refund_id, refund.status = provider_id, status
        refund.last_error = str(_get(result, "failure_reason", "") or "")
        refund.save(update_fields=["provider_refund_id", "status", "last_error", "updated_at"])
        if status == RefundStatus.SUCCEEDED:
            payment.status = PaymentStatus.REFUNDED if refund.amount >= payment.amount else PaymentStatus.PARTIALLY_REFUNDED
            payment.save(update_fields=["status", "updated_at"])
        event = {RefundStatus.SUCCEEDED: "refund_succeeded", RefundStatus.FAILED: "refund_failed"}.get(status, "refund_pending")
        notify_rental_event(payment.rental, event, event_key=f"refund:{refund.pk}:{status}:{attempt.pk}")

    @staticmethod
    def handle_event(event_type, obj):
        from payments.services import _get

        if event_type == "charge.refunded":
            # A lista completa também cobre mais de dez estornos e eventos fora de ordem.
            provider = _provider()
            for result in provider.Refund.list(charge=_get(obj, "id"), limit=100).auto_paging_iter():
                RefundService.handle_event("refund.updated", result)
            return
        metadata = _get(obj, "metadata") or {}
        attempt_id = _get(metadata, "attempt_id")
        provider_id = _get(obj, "id")
        if not provider_id:
            return
        # Eventos atrasados consultam o estado atual antes de alterar a evidência local.
        result = _provider().Refund.retrieve(provider_id)
        RefundService.apply(result, attempt_id=attempt_id)


def reconcile_refunds():
    ids = list(Refunds.objects.filter(status__in=(RefundStatus.PENDING, RefundStatus.FAILED)).values_list("pk", flat=True))
    for refund_id in ids:
        RefundService.process(refund_id)
    return len(ids)
