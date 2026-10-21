"""Cancelamento libera as datas; uma obrigação durável acompanha o estorno separadamente."""
from decimal import Decimal

import stripe
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import NotFound, PermissionDenied

from common.exceptions import Conflict
from contracts.models import Contracts
from notifications.events import notify_rental_event
from payments.models import Payments
from payments.refunds import RefundService
from payments.services import _get, _stripe
from postings.models import Postings
from rentals.models import Rentals
from rentals.policy import cancellation_quote


class CancellationInputSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=1000, allow_blank=True, required=False, default="")


class CancellationService:
    @staticmethod
    def get(rental_id, *, user):
        queryset = Rentals.objects.select_related("postings__machinery__owner", "lessee", "contracts").prefetch_related("payments")
        if user.role != "admin":
            from django.db.models import Q
            queryset = queryset.filter(Q(lessee=user) | Q(postings__machinery__owner=user))
        rental = queryset.filter(pk=rental_id).first()
        if rental is None:
            raise NotFound("Locação não encontrada.")
        return rental

    @staticmethod
    def cancel(rental_id, data, *, user):
        serializer = CancellationInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        reference = CancellationService.get(rental_id, user=user)
        refund_ids = CancellationService._cancel(reference, user=user, reason=serializer.validated_data["reason"])
        # A falha do provedor não desfaz o cancelamento já confirmado no banco.
        for refund_id in refund_ids:
            RefundService.process(refund_id)
        return CancellationService.get(rental_id, user=user)

    @staticmethod
    @transaction.atomic
    def _cancel(reference, *, user=None, reason="", deadline=False):
        posting = Postings.objects.select_related("machinery__owner").select_for_update(of=("self", "machinery")).get(pk=reference.postings_id)
        rental = Rentals.objects.select_for_update().get(pk=reference.pk)
        rental.postings = posting
        contract = Contracts.objects.select_for_update().filter(rental=rental).first()
        payments = list(Payments.objects.select_for_update().filter(rental=rental))
        if rental.status == "cancelled":
            return list(rental.payments.filter(refund__isnull=False).values_list("refund__pk", flat=True))
        if deadline and (contract is None or contract.status != "pending_signatures"
                         or contract.signature_deadline is None or contract.signature_deadline > timezone.now()
                         or rental.status not in ("active", "signed")):
            return []
        quote = cancellation_quote(rental, user, full_refund=deadline)
        if not quote["allowed"]:
            if quote["reason_code"] in ("not_a_party", "already_started"):
                raise PermissionDenied(quote["policy_text"])
            raise Conflict(quote["policy_text"], code=quote["reason_code"])
        for payment in payments:
            if payment.status == "pending" and payment.session_id:
                provider = _stripe()
                try:
                    session = provider.checkout.Session.retrieve(payment.session_id)
                    if _get(session, "status") == "open":
                        session = provider.checkout.Session.expire(payment.session_id)
                    if _get(session, "status") != "expired":
                        raise Conflict("Pagamento em confirmação. Aguarde e tente cancelar novamente.", code="payment_confirming")
                except stripe.StripeError as exc:
                    # Expirar pode disputar com o checkout; não libera a reserva sem confirmação.
                    raise Conflict("Não foi possível encerrar o checkout. O pagamento pode estar em confirmação.", code="payment_confirming") from exc
                payment.status = "expired"
                payment.save(update_fields=["status", "updated_at"])
        rental.status = "cancelled"
        rental.cancelled_at = rental.updated_at = timezone.now()
        rental.cancelled_by = user
        rental.cancellation_reason = reason
        rental.reservation_expires_at = None
        rental.save(update_fields=["status", "cancelled_at", "cancelled_by", "cancellation_reason", "reservation_expires_at", "updated_at"])
        if contract:
            contract.status = "cancelled"
            contract.save(update_fields=["status"])
            for amendment in contract.amendments.filter(status="pending"):
                amendment.status, amendment.decided_at = "expired", timezone.now()
                amendment.save(update_fields=["status", "decided_at"])
                notify_rental_event(rental, "amendment_expired", event_key=f"amendment:{amendment.pk}:expired", contract=contract)
        paid = [p for p in payments if p.status == "approved"]
        total = sum((p.amount for p in paid), Decimal("0.00"))
        target = Decimal(quote["refund_amount"])
        remaining = target
        refunds = []
        for index, payment in enumerate(paid):
            amount = remaining if index == len(paid) - 1 else (target * payment.amount / total).quantize(Decimal("0.01"))
            remaining -= amount
            if amount > 0:
                refunds.append(RefundService.request(payment, amount, reason=reason or quote["policy_text"], user=user).pk)
        actor = user.name if user else "Prazo de assinatura encerrado"
        notify_rental_event(rental, "rental_cancelled", event_key=f"rental:{rental.pk}:rental_cancelled",
                            contract=contract, detail=f"Responsável: {actor}. {quote['policy_text']}")
        return refunds
