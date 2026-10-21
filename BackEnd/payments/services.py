import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone as datetime_timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

import stripe
from django.conf import settings
from django.core.exceptions import ValidationError as InvalidIdentifier
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from common.exceptions import BadGateway, Conflict, ServiceUnavailable
from contracts.models import Contracts
from contracts.revisions import freeze_initial_revision
from notifications.events import notify_rental_event
from payments.availability import MINUTOS_DE_RESERVA, periodos_ocupados, reserva_retida, tem_conflito
from payments.enums import OPEN_PAYMENT_STATUSES, VISIBLE_PAYMENT_STATUSES, PaymentStatus
from payments.models import PaymentEvents, Payments
from payments.serializer import QuoteInputSerializer
from payments.pricing import Cotacao, cotar
from postings.models import Postings
from rentals.models import Rentals

logger = logging.getLogger(__name__)
CHECKOUT_COMPLETED = "checkout.session.completed"
CHECKOUT_EXPIRED = "checkout.session.expired"
CHECKOUT_SUCCEEDED = "checkout.session.async_payment_succeeded"
CHECKOUT_FAILED = "checkout.session.async_payment_failed"
REFUND_EVENTS = ("refund.created", "refund.updated", "refund.failed", "charge.refunded")
HANDLED_EVENTS = (CHECKOUT_COMPLETED, CHECKOUT_SUCCEEDED, CHECKOUT_EXPIRED, CHECKOUT_FAILED, *REFUND_EVENTS)
# Stripe requires a session to stay open at least 30 minutes after it is created.
MIN_SESSION_LIFETIME = timedelta(minutes=MINUTOS_DE_RESERVA, seconds=30)
# 4xx answers: Stripe received the request and refused it, so no session exists.
DEFINITIVE_ERRORS = (
    stripe.InvalidRequestError, stripe.AuthenticationError, stripe.PermissionError,
    stripe.CardError, stripe.IdempotencyError,
)


def _stripe(*, checkout=True):
    if checkout and (not settings.STRIPE_SECRET_KEY or not settings.STRIPE_WEBHOOK_SECRET):
        raise ServiceUnavailable(
            "Pagamentos indisponíveis no momento. A configuração do provedor precisa ser concluída pela plataforma.",
            code="payment_not_configured",
        )
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def _get(obj: Any, key: str, default: Any = None) -> Any:
    """StripeObject supports key access and membership but is not a dict."""
    try:
        return obj[key] if key in obj else default
    except TypeError:
        return default


@dataclass(frozen=True)
class CheckoutSession:
    url: str
    amount: Decimal


class PaymentService:
    @staticmethod
    def create_checkout(rental_id: UUID, *, user) -> CheckoutSession:
        """Abre o Stripe Checkout sem perder o rastro de uma criação incerta (passo 2.1).

        1. Sob os locks da reserva: valida, grava a tentativa (chave de
           idempotência + parâmetros exatos) e estende a retenção das datas.
        2. Sem locks: chama o Stripe com essa chave. Se a resposta se perder, a
           repetição com a mesma chave devolve a mesma sessão em vez de criar outra.
        3. Sob os locks: liga a sessão à tentativa.
        """
        prepared = PaymentService._prepare_checkout(rental_id, user=user)
        if isinstance(prepared, CheckoutSession):
            return prepared
        try:
            session = _stripe().checkout.Session.create(
                **prepared.provider_request, idempotency_key=prepared.idempotency_key,
            )
        except stripe.StripeError as exc:
            PaymentService._attempt_failed(prepared.pk, exc)
            raise BadGateway("Não foi possível iniciar o pagamento.") from exc
        return PaymentService._attach_session(prepared.pk, session)

    @staticmethod
    @transaction.atomic
    def _prepare_checkout(rental_id: UUID, *, user) -> "CheckoutSession | Payments":
        try:
            reference = Rentals.objects.get(pk=rental_id, lessee=user)
        except Rentals.DoesNotExist as exc:
            raise NotFound("Locação não encontrada.") from exc
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
        # The quote frozen at booking is the agreed price while the hold lasts.
        # A lapsed hold had to be revalidated above, so it takes today's rate.
        quote = None
        if rental.priced_at is None or rental.total_price is None or not reserva_retida(rental):
            quote = cotar(posting, rental.start_date, rental.end_date)
        total = quote.total if quote else Decimal(rental.total_price)
        if not total.is_finite() or total <= 0 or total > Decimal("99999999.99"):
            raise ValidationError("Não foi possível calcular o valor da locação.")
        provider = _stripe()  # configuration check: nothing is written when payments are unavailable
        now = timezone.now()

        previous = rental.payments.filter(status=PaymentStatus.PENDING).order_by("-created_at").first()
        if previous:
            try:
                existing = provider.checkout.Session.retrieve(previous.session_id)
            except stripe.StripeError as exc:
                raise BadGateway("Não foi possível iniciar o pagamento.") from exc
            if existing.status == "open":
                rental.status = "awaiting_payment"
                rental.total_price = previous.amount
                rental.reservation_expires_at = datetime.fromtimestamp(existing.expires_at, datetime_timezone.utc)
                rental.updated_at = now
                rental.save(update_fields=["status", "total_price", "reservation_expires_at", "updated_at"])
                notify_rental_event(rental, "payment_pending", event_key=f"payment:{previous.pk}:pending")
                return CheckoutSession(url=str(existing.url), amount=previous.amount)
            if existing.status == "complete":
                raise Conflict("O pagamento já foi enviado. Aguarde a confirmação.")
            previous.status = PaymentStatus.EXPIRED
            previous.save(update_fields=["status", "updated_at"])
            notify_rental_event(rental, "payment_expired", event_key=f"payment:{previous.pk}:expired")

        attempt = rental.payments.filter(status=PaymentStatus.CREATING).order_by("-created_at").first()
        reusable = (attempt is not None and attempt.amount == total and attempt.provider_request
                    and attempt.provider_request["expires_at"] >= int((now + MIN_SESSION_LIFETIME).timestamp()))
        if attempt is not None and not reusable:
            # Too close to its expiry or for another amount: Stripe would refuse the
            # same key with other parameters. A session it may have created is never
            # shown to anyone and expires by itself.
            attempt.status = PaymentStatus.FAILED
            attempt.last_error = "Substituída por uma nova tentativa."
            attempt.save(update_fields=["status", "last_error", "updated_at"])
        if not reusable:
            attempt = PaymentService._new_attempt(rental, posting, total, now)

        snapshot = quote.snapshot() if quote else {"total_price": total}
        for field, value in snapshot.items():
            setattr(rental, field, value)
        # The hold covers the attempt, so the provider call can run without the booking locks.
        rental.status = "awaiting_payment"
        rental.reservation_expires_at = datetime.fromtimestamp(attempt.provider_request["expires_at"], datetime_timezone.utc)
        rental.updated_at = now
        rental.save(update_fields=[*snapshot, "status", "reservation_expires_at", "updated_at"])
        return attempt

    @staticmethod
    def _new_attempt(rental, posting, total: Decimal, now) -> Payments:
        payment_id = uuid.uuid4()
        machine = posting.machinery
        description = " ".join(filter(None, [machine.brand, machine.model])) or "Maquinário"
        return_url = f"{settings.FRONTEND_URL}/reservar/{rental.postings_id}?locacao={rental.id}"
        # Stripe requires at least 30 minutes, including request transit time.
        expires_at = int((now + timedelta(minutes=MINUTOS_DE_RESERVA, seconds=60)).timestamp())
        return Payments.objects.create(
            id=payment_id, rental=rental, status=PaymentStatus.CREATING, amount=total,
            # Deterministic per attempt: under the rental lock the count is stable.
            idempotency_key=f"checkout:{rental.id}:{rental.payments.count() + 1}",
            provider_request={
                "mode": "payment",
                "expires_at": expires_at,
                "line_items": [{"price_data": {"currency": "brl", "unit_amount": int(total * 100),
                                               "product_data": {"name": f"Locação — {description}"}},
                                "quantity": 1}],
                "success_url": f"{return_url}&pagamento=sucesso",
                "cancel_url": f"{return_url}&pagamento=cancelado",
                "metadata": {"rental_id": str(rental.id), "payment_id": str(payment_id)},
            },
        )

    @staticmethod
    @transaction.atomic
    def _attempt_failed(payment_id: UUID, exc: Exception) -> None:
        """Erro 4xx: nenhuma sessão existe. Rede ou 5xx: incerto, a mesma chave fica para a próxima tentativa.

        Nos dois casos o locatário nunca recebeu um link, então a reserva volta a
        `pending`: ele pode tentar de novo (com a mesma chave) ou cancelar.
        """
        now = timezone.now()
        status = PaymentStatus.FAILED if isinstance(exc, DEFINITIVE_ERRORS) else PaymentStatus.CREATING
        payment = Payments.objects.get(pk=payment_id)
        Payments.objects.filter(pk=payment_id, status=PaymentStatus.CREATING).update(
            status=status, last_error=str(exc)[:1000], updated_at=now,
        )
        Rentals.objects.filter(pk=payment.rental_id, status="awaiting_payment").exclude(
            payments__status__in=OPEN_PAYMENT_STATUSES,
        ).update(status="pending", updated_at=now)
        logger.warning("Tentativa de pagamento %s sem sessão confirmada: %s", payment_id, exc)

    @staticmethod
    def _attach_session(payment_id: UUID, session) -> CheckoutSession:
        result = PaymentService._attach_session_locked(payment_id, session)
        if result is None:
            PaymentService.close_cancelled_checkout(payment_id, session.id)
            raise Conflict("Esta reserva foi cancelada durante a criação do pagamento.")
        return result

    @staticmethod
    def close_cancelled_checkout(payment_id, session_id) -> str:
        """Fecha uma sessão tardia fora dos locks; pagamento confirmado gera estorno."""
        try:
            provider = _stripe()
            session = provider.checkout.Session.retrieve(session_id)
            if _get(session, "status") == "open":
                try:
                    session = provider.checkout.Session.expire(session_id)
                except stripe.StripeError:
                    session = provider.checkout.Session.retrieve(session_id)
            if _get(session, "status") == "complete" and _get(session, "payment_status") == "paid":
                PaymentService._approve(session_id, payment_id=str(payment_id), payment_intent=_get(session, "payment_intent"))
                return "approved"
            if _get(session, "status") == "expired":
                PaymentService._expire(session_id, payment_id=str(payment_id))
                return "expired"
        except stripe.StripeError as exc:
            logger.warning("Sessão tardia %s aguardando conciliação: %s", session_id, exc)
        return "uncertain"

    @staticmethod
    @transaction.atomic
    def _attach_session_locked(payment_id: UUID, session) -> CheckoutSession | None:
        payment = Payments.objects.select_related("rental").get(pk=payment_id)
        Postings.objects.select_for_update().get(pk=payment.rental.postings_id)
        rental = Rentals.objects.select_for_update().get(pk=payment.rental_id)
        payment = Payments.objects.select_for_update().get(pk=payment_id)
        if payment.session_id is None:
            payment.session_id = session.id
        if rental.status == "cancelled":
            if payment.status == PaymentStatus.CREATING:
                payment.status = PaymentStatus.PENDING
            payment.save(update_fields=["session_id", "status", "updated_at"])
            return None
        if payment.status == PaymentStatus.CREATING:
            payment.status = PaymentStatus.PENDING
            payment.last_error = ""
            payment.save(update_fields=["session_id", "status", "last_error", "updated_at"])
            if rental.status == "pending":
                rental.status = "awaiting_payment"
            rental.reservation_expires_at = datetime.fromtimestamp(session.expires_at, datetime_timezone.utc)
            rental.updated_at = timezone.now()
            rental.save(update_fields=["status", "reservation_expires_at", "updated_at"])
            notify_rental_event(rental, "payment_pending", event_key=f"payment:{payment.pk}:pending")
        else:
            # A webhook matched the attempt by metadata first; the session is the same.
            payment.save(update_fields=["session_id", "updated_at"])
        return CheckoutSession(url=str(session.url), amount=payment.amount)

    @staticmethod
    def get_latest(rental_id: UUID, *, user) -> Payments:
        # Attempts still without a session are internal; the tenant follows real checkouts.
        payment = Payments.objects.select_related("rental").filter(
            rental_id=rental_id, rental__lessee=user, status__in=VISIBLE_PAYMENT_STATUSES,
        ).order_by("-created_at").first()
        if payment is None:
            raise NotFound("Nenhum pagamento encontrado para esta locação.")
        return payment

    @staticmethod
    def list_occupied_periods(posting_id: UUID):
        return periodos_ocupados(posting_id)

    @staticmethod
    def quote(posting_id: UUID, data) -> Cotacao:
        """Mesma cotação que a reserva congela, para a tela exibir o valor do servidor."""
        serializer = QuoteInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        posting = Postings.objects.filter(pk=posting_id).first()
        if posting is None:
            raise NotFound("Anúncio não encontrado.")
        return cotar(posting, serializer.validated_data["start_date"], serializer.validated_data["end_date"])

    @staticmethod
    def handle_webhook(payload: bytes, signature: str) -> None:
        if not settings.STRIPE_WEBHOOK_SECRET:
            raise ServiceUnavailable("Webhook do Stripe não configurado.")
        try:
            event = _stripe(checkout=False).Webhook.construct_event(payload, signature, settings.STRIPE_WEBHOOK_SECRET)
        except (ValueError, stripe.SignatureVerificationError) as exc:
            raise ValidationError("Assinatura do webhook inválida.") from exc
        event_type = _get(event, "type")
        if event_type not in HANDLED_EVENTS:
            return
        session = _get(_get(event, "data"), "object")
        session_id = _get(session, "id")
        if not session_id:
            return
        event_id = _get(event, "id")
        if event_id:
            record, _ = PaymentEvents.objects.get_or_create(
                id=event_id, defaults={"type": event_type, "session_id": session_id},
            )
            if record.processed_at is not None:
                return  # Stripe redelivers events; each one is applied once.
        payment_id = _get(_get(session, "metadata") or {}, "payment_id")
        try:
            if event_type in REFUND_EVENTS:
                from payments.refunds import RefundService
                RefundService.handle_event(event_type, session)
            elif event_type in (CHECKOUT_COMPLETED, CHECKOUT_SUCCEEDED):
                if _get(session, "payment_status") == "paid":
                    PaymentService._approve(session_id, payment_id=payment_id,
                                            payment_intent=_get(session, "payment_intent"))
            else:
                PaymentService._expire(session_id, payment_id=payment_id)
        except Exception as exc:
            if event_id:
                PaymentEvents.objects.filter(pk=event_id).update(attempts=F("attempts") + 1, last_error=str(exc)[:1000])
            raise
        if event_id:
            PaymentEvents.objects.filter(pk=event_id).update(
                processed_at=timezone.now(), attempts=F("attempts") + 1, last_error="",
            )

    @staticmethod
    def _find_payment(session_id: str, payment_id: str | None) -> Payments | None:
        """By session; else the attempt named in the session metadata, whose response was lost."""
        payment = Payments.objects.select_related("rental").filter(session_id=session_id).first()
        if payment is None and payment_id:
            try:
                payment = Payments.objects.select_related("rental").filter(
                    pk=payment_id, session_id__isnull=True,
                ).first()
            except (ValueError, TypeError, InvalidIdentifier):
                payment = None
        return payment

    @staticmethod
    @transaction.atomic
    def _approve(session_id: str, *, payment_id: str | None = None, payment_intent: str | None = None) -> None:
        payment = PaymentService._find_payment(session_id, payment_id)
        if payment is None:
            return
        Postings.objects.select_for_update().select_related("machinery").get(pk=payment.rental.postings_id)
        rental = Rentals.objects.select_for_update().get(pk=payment.rental_id)
        contract = Contracts.objects.select_for_update().filter(rental=rental).first()
        payment = Payments.objects.select_for_update().get(pk=payment.pk)
        if payment.session_id is None:
            payment.session_id = session_id
        if payment_intent and not payment.payment_intent_id:
            payment.payment_intent_id = str(payment_intent)  # needed to refund later
        if rental.status == "cancelled":
            from payments.refunds import RefundService
            if payment.status not in ("refunded", "partially_refunded"):
                payment.status = "approved"
            payment.save(update_fields=["session_id", "payment_intent_id", "status", "updated_at"])
            refund = RefundService.request(payment, payment.amount, reason="Pagamento recebido após o cancelamento.")
            transaction.on_commit(lambda: RefundService.process(refund.pk))
            return
        if payment.status in ("approved", "requires_review", "refunded", "partially_refunded"):
            payment.save(update_fields=["session_id", "payment_intent_id", "updated_at"])
            return
        if rental.status not in ("pending", "awaiting_payment") or tem_conflito(
            rental.postings_id, rental.start_date, rental.end_date, ignorar=rental.id,
        ):
            payment.status = "requires_review"
            payment.save(update_fields=["session_id", "payment_intent_id", "status", "updated_at"])
            notify_rental_event(rental, "payment_requires_review", event_key=f"payment:{payment.pk}:requires_review")
            logger.error("Pagamento %s precisa de revisão: reserva indisponível.", payment.id)
            return
        payment.status = "approved"
        payment.save(update_fields=["session_id", "payment_intent_id", "status", "updated_at"])
        rental.status = "active"
        rental.updated_at = timezone.now()
        rental.save(update_fields=["status", "updated_at"])
        # Paid terms are frozen now: later profile/listing/template edits cannot
        # change what the two parties sign.
        if contract is not None:
            contract.rental = rental
            freeze_initial_revision(contract)
        notify_rental_event(rental, "payment_approved", event_key=f"payment:{payment.pk}:approved")

    @staticmethod
    @transaction.atomic
    def _expire(session_id: str, *, payment_id: str | None = None) -> None:
        payment = PaymentService._find_payment(session_id, payment_id)
        if payment is None:
            return
        Postings.objects.select_for_update().select_related("machinery").get(pk=payment.rental.postings_id)
        rental = Rentals.objects.select_for_update().get(pk=payment.rental_id)
        payment = Payments.objects.select_for_update().get(pk=payment.pk)
        if payment.status not in (PaymentStatus.PENDING, PaymentStatus.CREATING):
            return
        payment.session_id = payment.session_id or session_id
        payment.status = PaymentStatus.EXPIRED
        payment.save(update_fields=["session_id", "status", "updated_at"])
        notify_rental_event(rental, "payment_expired", event_key=f"payment:{payment.pk}:expired")
        open_attempts = rental.payments.filter(status__in=(PaymentStatus.PENDING, PaymentStatus.CREATING))
        if rental.status == "awaiting_payment" and not open_attempts.exists():
            rental.status = "cancelled"
            rental.updated_at = timezone.now()
            rental.save(update_fields=["status", "updated_at"])
            Contracts.objects.filter(rental=rental, status="pending_signatures").update(status="cancelled")
            notify_rental_event(rental, "rental_cancelled", event_key=f"rental:{rental.pk}:rental_cancelled")
