from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from uuid import UUID

import stripe
from django.conf import settings
from django.db import transaction
from rest_framework.exceptions import NotFound, ValidationError

from common.exceptions import BadGateway, Conflict, ServiceUnavailable
from payments.availability import periodos_ocupados, tem_conflito
from payments.enums import PaymentStatus
from payments.models import Payments
from payments.pricing import calcular_total
from rentals.enums import RentalStatus
from rentals.models import Rentals

CHECKOUT_COMPLETED = "checkout.session.completed"
CHECKOUT_EXPIRED = "checkout.session.expired"


@dataclass(frozen=True)
class CheckoutSession:
    url: str
    amount: Decimal


class PaymentService:
    @staticmethod
    def create_checkout(rental_id: UUID) -> CheckoutSession:
        """Abre a sessão de pagamento do Stripe para a locação.

        A chamada ao Stripe fica fora da transação; só a gravação do pagamento e
        a mudança de status da locação são atômicas.
        """
        try:
            rental = Rentals.objects.select_related("postings__machinery").get(pk=rental_id)
        except Rentals.DoesNotExist as exc:
            raise NotFound("Locação não encontrada.") from exc

        if tem_conflito(rental.postings_id, rental.start_date, rental.end_date, ignorar=rental.id):
            raise Conflict("O período escolhido já está reservado.", code="period_unavailable")

        total = calcular_total(rental)
        if total <= 0:
            raise ValidationError("Não foi possível calcular o valor da locação.")

        machine = rental.postings.machinery
        description = " ".join(filter(None, [machine.brand, machine.model])) or "Maquinário"
        return_url = f"{settings.FRONTEND_URL}/reservar/{rental.postings_id}?locacao={rental.id}"

        stripe.api_key = settings.STRIPE_SECRET_KEY
        try:
            session = stripe.checkout.Session.create(
                mode="payment",
                line_items=[
                    {
                        "price_data": {
                            "currency": "brl",
                            "unit_amount": int(total * 100),
                            "product_data": {"name": f"Locação — {description}"},
                        },
                        "quantity": 1,
                    }
                ],
                success_url=f"{return_url}&pagamento=sucesso",
                cancel_url=f"{return_url}&pagamento=cancelado",
                metadata={"rental_id": str(rental.id)},
            )
        except stripe.StripeError as exc:
            raise BadGateway("Não foi possível iniciar o pagamento.") from exc

        PaymentService._register_checkout(rental, session_id=session.id, total=total)
        return CheckoutSession(url=str(session.url), amount=total)

    @staticmethod
    def get_latest(rental_id: UUID) -> Payments:
        payment = (
            Payments.objects.select_related("rental")
            .filter(rental_id=rental_id)
            .order_by("-created_at")
            .first()
        )
        if payment is None:
            raise NotFound("Nenhum pagamento encontrado para esta locação.")
        return payment

    @staticmethod
    def list_occupied_periods(posting_id: UUID) -> list[dict[str, Any]]:
        return periodos_ocupados(posting_id)

    @staticmethod
    def handle_webhook(payload: bytes, signature: str) -> None:
        """Processa os eventos do Stripe que mudam o estado do pagamento.

        Eventos de outros tipos, ou sem o id da sessão, são ignorados: o Stripe
        só precisa do 200 para parar de reenviar.
        """
        if not settings.STRIPE_WEBHOOK_SECRET:
            raise ServiceUnavailable("Webhook do Stripe não configurado.")

        try:
            event = stripe.Webhook.construct_event(
                payload, signature, settings.STRIPE_WEBHOOK_SECRET
            )
        except (ValueError, stripe.SignatureVerificationError) as exc:
            raise ValidationError("Assinatura do webhook inválida.") from exc

        event_type = event["type"]
        if event_type not in (CHECKOUT_COMPLETED, CHECKOUT_EXPIRED):
            return
        try:
            session_id = str(event["data"]["object"]["id"])
        except (KeyError, TypeError):
            return

        if event_type == CHECKOUT_COMPLETED:
            PaymentService._approve(session_id)
        else:
            PaymentService._expire(session_id)

    @staticmethod
    @transaction.atomic
    def _register_checkout(rental: Rentals, *, session_id: str, total: Decimal) -> None:
        Payments.objects.create(rental=rental, session_id=session_id, amount=total)
        rental.total_price = total
        rental.status = RentalStatus.AWAITING_PAYMENT
        rental.save(update_fields=["total_price", "status"])

    @staticmethod
    @transaction.atomic
    def _approve(session_id: str) -> None:
        payment = (
            Payments.objects.select_for_update()
            .select_related("rental")
            .filter(session_id=session_id)
            .first()
        )
        # O Stripe pode reenviar o mesmo evento: aprovar duas vezes é no-op.
        if payment is None or payment.status == PaymentStatus.APPROVED:
            return
        payment.status = PaymentStatus.APPROVED
        payment.save(update_fields=["status", "updated_at"])
        rental = payment.rental
        rental.status = RentalStatus.ACTIVE
        rental.save(update_fields=["status"])

    @staticmethod
    @transaction.atomic
    def _expire(session_id: str) -> None:
        payment = (
            Payments.objects.select_for_update()
            .select_related("rental")
            .filter(session_id=session_id)
            .first()
        )
        if payment is None or payment.status != PaymentStatus.PENDING:
            return
        payment.status = PaymentStatus.EXPIRED
        payment.save(update_fields=["status", "updated_at"])
        rental = payment.rental
        if rental.status == RentalStatus.AWAITING_PAYMENT:
            rental.status = RentalStatus.CANCELLED
            rental.save(update_fields=["status"])
