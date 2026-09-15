import uuid
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

import stripe
from django.test import TestCase, override_settings
from django.utils import timezone

from machines.models import Machines
from payments.models import Payments
from postings.models import Postings
from rentals.models import Rentals
from users.models import Users

CREATE_SESSION = "payments.services.stripe.checkout.Session.create"
CONSTRUCT_EVENT = "payments.services.stripe.Webhook.construct_event"


def make_user(role, seq):
    return Users.objects.create(
        id=uuid.uuid4(),
        name=f"{role.title()} {seq}",
        document=f"doc{seq:011d}",
        email=f"{role}{seq}@teste.com",
        role=role,
        address="Rua Teste, 100",
        birth_date=date(1990, 1, 1),
        status="active",
    )


class PaymentTestCase(TestCase):
    def setUp(self):
        owner = make_user("locador", 1)
        self.lessee = make_user("locatario", 2)
        machine = Machines.objects.create(
            id=uuid.uuid4(), owner=owner, brand="John Deere", model="6135J"
        )
        self.posting = Postings.objects.create(
            id=uuid.uuid4(), machinery=machine, hourly_rate="100.00", status="active"
        )
        self.start = timezone.now() + timedelta(days=10)
        self.rental = self.make_rental(status="pending")

    def make_rental(self, status, created_at=None, offset_days=0):
        start = self.start + timedelta(days=offset_days)
        return Rentals.objects.create(
            id=uuid.uuid4(),
            postings=self.posting,
            lessee=self.lessee,
            start_date=start,
            end_date=start + timedelta(days=2),
            status=status,
            created_at=created_at or timezone.now(),
        )


class CheckoutTests(PaymentTestCase):
    def checkout(self, rental_id=None):
        return self.client.post(f"/api/rentals/{rental_id or self.rental.id}/checkout")

    def test_checkout_recalculates_amount_and_holds_the_rental(self):
        session = SimpleNamespace(id="cs_test_1", url="https://checkout.stripe.com/c/cs_test_1")
        with patch(CREATE_SESSION, return_value=session) as create:
            response = self.checkout()

        self.assertEqual(response.status_code, 200, response.content)
        # 100/h x 8h x 3 diárias + 5% de taxa.
        self.assertEqual(response.json(), {"url": session.url, "amount": "2520.00"})
        self.assertEqual(
            create.call_args.kwargs["line_items"][0]["price_data"]["unit_amount"], 252000
        )
        payment = Payments.objects.get()
        self.assertEqual(payment.status, "pending")
        self.rental.refresh_from_db()
        self.assertEqual(self.rental.status, "awaiting_payment")
        self.assertEqual(self.rental.total_price, Decimal("2520.00"))

    def test_overlapping_confirmed_rental_blocks_checkout(self):
        self.make_rental(status="active", offset_days=1)

        with patch(CREATE_SESSION) as create:
            response = self.checkout()

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "period_unavailable")
        create.assert_not_called()

    def test_stripe_failure_returns_502_and_records_nothing(self):
        with patch(CREATE_SESSION, side_effect=stripe.StripeError("fora do ar")):
            response = self.checkout()

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["code"], "external_service_error")
        self.assertFalse(Payments.objects.exists())

    def test_unknown_rental_returns_404(self):
        response = self.checkout(rental_id=uuid.uuid4())

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["message"], "Locação não encontrada.")


class PaymentStatusAndOccupancyTests(PaymentTestCase):
    def test_status_is_404_until_a_checkout_exists(self):
        response = self.client.get(f"/api/rentals/{self.rental.id}/payment")

        self.assertEqual(response.status_code, 404)

    def test_status_returns_latest_payment(self):
        Payments.objects.create(rental=self.rental, session_id="cs_1", amount="2520.00")

        response = self.client.get(f"/api/rentals/{self.rental.id}/payment")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(), {"status": "pending", "amount": "2520.00", "rental_status": "pending"}
        )

    def test_occupancy_ignores_stale_unpaid_reservations(self):
        Rentals.objects.filter(id=self.rental.id).update(
            created_at=timezone.now() - timedelta(hours=1)
        )
        confirmed = self.make_rental(status="signed", offset_days=20)

        response = self.client.get(f"/api/postings/{self.posting.id}/ocupacao")

        self.assertEqual(response.status_code, 200)
        periods = response.json()["ocupados"]
        self.assertEqual([p["id"] for p in periods], [str(confirmed.id)])
        self.assertEqual(periods[0]["status"], "signed")


@override_settings(STRIPE_WEBHOOK_SECRET="whsec_test")
class WebhookTests(PaymentTestCase):
    def setUp(self):
        super().setUp()
        Rentals.objects.filter(id=self.rental.id).update(status="awaiting_payment")
        self.payment = Payments.objects.create(
            rental=self.rental, session_id="cs_test_1", amount="2520.00"
        )

    def send(self, event=None, **patch_kwargs):
        if event is not None:
            patch_kwargs["return_value"] = event
        with patch(CONSTRUCT_EVENT, **patch_kwargs):
            return self.client.post(
                "/api/payments/webhook",
                data=b'{"id": "evt_1"}',
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="t=1,v1=abc",
            )

    @staticmethod
    def event(event_type, session_id="cs_test_1"):
        return {"type": event_type, "data": {"object": {"id": session_id}}}

    def test_completed_session_approves_payment_and_activates_rental(self):
        response = self.send(self.event("checkout.session.completed"))

        self.assertEqual(response.status_code, 200)
        self.payment.refresh_from_db()
        self.rental.refresh_from_db()
        self.assertEqual(self.payment.status, "approved")
        self.assertEqual(self.rental.status, "active")

    def test_expired_session_cancels_the_held_rental(self):
        response = self.send(self.event("checkout.session.expired"))

        self.assertEqual(response.status_code, 200)
        self.payment.refresh_from_db()
        self.rental.refresh_from_db()
        self.assertEqual(self.payment.status, "expired")
        self.assertEqual(self.rental.status, "cancelled")

    def test_unrelated_events_are_acknowledged_and_ignored(self):
        response = self.send(self.event("customer.created"))

        self.assertEqual(response.status_code, 200)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, "pending")

    def test_invalid_signature_returns_400(self):
        response = self.send(side_effect=stripe.SignatureVerificationError("inválida", "t=1"))

        self.assertEqual(response.status_code, 400)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, "pending")

    @override_settings(STRIPE_WEBHOOK_SECRET="")
    def test_missing_secret_returns_503(self):
        response = self.send(self.event("checkout.session.completed"))

        self.assertEqual(response.status_code, 503)
