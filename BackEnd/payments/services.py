import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone as datetime_timezone
from decimal import Decimal
from uuid import UUID

import stripe
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from common.exceptions import BadGateway, Conflict, ServiceUnavailable
from contracts.models import Contracts
from notifications.events import notify_rental_event
from payments.availability import MINUTOS_DE_RESERVA, periodos_ocupados, tem_conflito
from payments.models import Payments
from payments.pricing import calcular_total
from postings.models import Postings
from rentals.models import Rentals

logger = logging.getLogger(__name__)
CHECKOUT_COMPLETED = "checkout.session.completed"
CHECKOUT_EXPIRED = "checkout.session.expired"
CHECKOUT_SUCCEEDED = "checkout.session.async_payment_succeeded"
CHECKOUT_FAILED = "checkout.session.async_payment_failed"


def _stripe(*, checkout=True):
    if checkout and (not settings.STRIPE_SECRET_KEY or not settings.STRIPE_WEBHOOK_SECRET):
        raise ServiceUnavailable(
            "Pagamentos indisponíveis no momento. A configuração do provedor precisa ser concluída pela plataforma.",
            code="payment_not_configured",
        )
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


@dataclass(frozen=True)
class CheckoutSession:
    url: str
    amount: Decimal


class PaymentService:
    @staticmethod
    @transaction.atomic
    def create_checkout(rental_id: UUID, *, user) -> CheckoutSession:
        try:
            reference = Rentals.objects.get(pk=rental_id, lessee=user)
        except Rentals.DoesNotExist as exc:
            raise NotFound("Locação não encontrada.") from exc
        # Keep the booking locks while contacting Stripe: concurrent retries must
        # not create two sessions, nor race another reservation for these dates.
        posting = Postings.objects.select_for_update().select_related("machinery").get(pk=reference.postings_id)
        rental = Rentals.objects.select_for_update().get(pk=rental_id)
        rental.postings = posting
        if rental.status not in ("pending", "awaiting_payment"):
            raise Conflict("Esta reserva não está aguardando pagamento.")
        if rental.payments.filter(status__in=("approved", "requires_review")).exists():
            raise Conflict("Esta reserva já possui um pagamento recebido ou em análise.")
        if posting.status != "active" or posting.machinery.status != "active" or rental.start_date <= timezone.now():
            raise Conflict("Esta reserva não está mais disponível para pagamento.")
        days = (rental.end_date.date() - rental.start_date.date()).days + 1
        if rental.end_date < rental.start_date or (
            posting.max_reservation_days and days > posting.max_reservation_days
        ) or (posting.availability_start and rental.start_date < posting.availability_start) or (
            posting.availability_end and rental.end_date > posting.availability_end
        ):
            raise Conflict("O período não atende mais à disponibilidade do anúncio.")
        if tem_conflito(rental.postings_id, rental.start_date, rental.end_date, ignorar=rental.id):
            raise Conflict("O período escolhido já está reservado.", code="period_unavailable")
        total = calcular_total(rental)
        if not total.is_finite() or total <= 0 or total > Decimal("99999999.99"):
            raise ValidationError("Não foi possível calcular o valor da locação.")
        machine = posting.machinery
        description = " ".join(filter(None, [machine.brand, machine.model])) or "Maquinário"
        return_url = f"{settings.FRONTEND_URL}/reservar/{rental.postings_id}?locacao={rental.id}"
        try:
            previous = Payments.objects.filter(rental=rental, status="pending").order_by("-created_at").first()
            if previous:
                existing = _stripe().checkout.Session.retrieve(previous.session_id)
                if existing.status == "open":
                    rental.status = "awaiting_payment"
                    rental.total_price = previous.amount
                    rental.reservation_expires_at = datetime.fromtimestamp(existing.expires_at, datetime_timezone.utc)
                    rental.updated_at = timezone.now()
                    rental.save(update_fields=["status", "total_price", "reservation_expires_at", "updated_at"])
                    notify_rental_event(rental, "payment_pending", event_key=f"payment:{previous.pk}:pending")
                    return CheckoutSession(url=str(existing.url), amount=previous.amount)
                if existing.status == "complete":
                    raise Conflict("O pagamento já foi enviado. Aguarde a confirmação.")
                previous.status = "expired"
                previous.save(update_fields=["status", "updated_at"])
                notify_rental_event(rental, "payment_expired", event_key=f"payment:{previous.pk}:expired")
            # Stripe requires at least 30 minutes, including request transit time.
            expires_at = int((timezone.now() + timedelta(minutes=MINUTOS_DE_RESERVA, seconds=60)).timestamp())
            session = _stripe().checkout.Session.create(
                mode="payment", expires_at=expires_at,
                line_items=[{"price_data": {"currency": "brl", "unit_amount": int(total * 100),
                             "product_data": {"name": f"Locação — {description}"}}, "quantity": 1}],
                success_url=f"{return_url}&pagamento=sucesso",
                cancel_url=f"{return_url}&pagamento=cancelado",
                metadata={"rental_id": str(rental.id)},
            )
        except stripe.StripeError as exc:
            raise BadGateway("Não foi possível iniciar o pagamento.") from exc
        PaymentService._register_checkout(rental, session_id=session.id, total=total, expires_at=session.expires_at)
        return CheckoutSession(url=str(session.url), amount=total)

    @staticmethod
    def get_latest(rental_id: UUID, *, user) -> Payments:
        payment = Payments.objects.select_related("rental").filter(
            rental_id=rental_id, rental__lessee=user,
        ).order_by("-created_at").first()
        if payment is None:
            raise NotFound("Nenhum pagamento encontrado para esta locação.")
        return payment

    @staticmethod
    def list_occupied_periods(posting_id: UUID):
        return periodos_ocupados(posting_id)

    @staticmethod
    def handle_webhook(payload: bytes, signature: str) -> None:
        if not settings.STRIPE_WEBHOOK_SECRET:
            raise ServiceUnavailable("Webhook do Stripe não configurado.")
        try:
            event = _stripe(checkout=False).Webhook.construct_event(payload, signature, settings.STRIPE_WEBHOOK_SECRET)
        except (ValueError, stripe.SignatureVerificationError) as exc:
            raise ValidationError("Assinatura do webhook inválida.") from exc
        # StripeObject supports key access/membership, but is not a dict.
        event_type = event["type"] if "type" in event else None
        if event_type not in (CHECKOUT_COMPLETED, CHECKOUT_SUCCEEDED, CHECKOUT_EXPIRED, CHECKOUT_FAILED):
            return
        try:
            session = event["data"]["object"]
            session_id = session["id"]
        except (KeyError, TypeError):
            return
        if event_type in (CHECKOUT_COMPLETED, CHECKOUT_SUCCEEDED):
            if "payment_status" in session and session["payment_status"] == "paid":
                PaymentService._approve(session_id)
        else:
            PaymentService._expire(session_id)

    @staticmethod
    def _register_checkout(rental, *, session_id, total, expires_at):
        payment = Payments.objects.create(rental=rental, session_id=session_id, amount=total)
        rental.total_price = total
        rental.status = "awaiting_payment"
        rental.reservation_expires_at = datetime.fromtimestamp(expires_at, datetime_timezone.utc)
        rental.updated_at = timezone.now()
        rental.save(update_fields=["total_price", "status", "reservation_expires_at", "updated_at"])
        notify_rental_event(rental, "payment_pending", event_key=f"payment:{payment.pk}:pending")

    @staticmethod
    @transaction.atomic
    def _approve(session_id: str) -> None:
        payment = Payments.objects.select_related("rental").filter(session_id=session_id).first()
        if payment is None:
            return
        Postings.objects.select_for_update().select_related("machinery").get(pk=payment.rental.postings_id)
        rental = Rentals.objects.select_for_update().get(pk=payment.rental_id)
        payment = Payments.objects.select_for_update().get(pk=payment.pk)
        if payment.status in ("approved", "requires_review"):
            return
        if rental.status not in ("pending", "awaiting_payment") or tem_conflito(
            rental.postings_id, rental.start_date, rental.end_date, ignorar=rental.id,
        ):
            payment.status = "requires_review"
            payment.save(update_fields=["status", "updated_at"])
            notify_rental_event(rental, "payment_requires_review", event_key=f"payment:{payment.pk}:requires_review")
            logger.error("Pagamento %s precisa de revisão: reserva indisponível.", payment.id)
            return
        payment.status = "approved"
        payment.save(update_fields=["status", "updated_at"])
        rental.status = "active"
        rental.updated_at = timezone.now()
        rental.save(update_fields=["status", "updated_at"])
        notify_rental_event(rental, "payment_approved", event_key=f"payment:{payment.pk}:approved")

    @staticmethod
    @transaction.atomic
    def _expire(session_id: str) -> None:
        payment = Payments.objects.select_related("rental").filter(session_id=session_id).first()
        if payment is None:
            return
        Postings.objects.select_for_update().select_related("machinery").get(pk=payment.rental.postings_id)
        rental = Rentals.objects.select_for_update().get(pk=payment.rental_id)
        payment = Payments.objects.select_for_update().get(pk=payment.pk)
        if payment.status != "pending":
            return
        payment.status = "expired"
        payment.save(update_fields=["status", "updated_at"])
        notify_rental_event(rental, "payment_expired", event_key=f"payment:{payment.pk}:expired")
        if rental.status == "awaiting_payment" and not rental.payments.filter(status="pending").exists():
            rental.status = "cancelled"
            rental.updated_at = timezone.now()
            rental.save(update_fields=["status", "updated_at"])
            Contracts.objects.filter(rental=rental, status="pending_signatures").update(status="cancelled")
            notify_rental_event(rental, "rental_cancelled", event_key=f"rental:{rental.pk}:rental_cancelled")
