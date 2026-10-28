"""Durable payment attempts, reconciliation and webhook deduplication (plan step 2.1)."""

from datetime import timedelta
from io import StringIO
from types import SimpleNamespace
from unittest.mock import patch

import stripe
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone

from notifications.models import Notification
from payments.models import PaymentEvents, Payments
from payments.reconcile import reconcile_payments
from payments.services import PaymentService
from payments.tests import CREATE_SESSION, PaymentTestCase

RETRIEVE_SESSION = "payments.services.stripe.checkout.Session.retrieve"
EXPIRE_SESSION = "payments.services.stripe.checkout.Session.expire"
CONSTRUCT_EVENT = "payments.services.stripe.Webhook.construct_event"


def session(session_id="cs_attempt", **extra):
    return SimpleNamespace(id=session_id, url=f"https://checkout.stripe.com/c/{session_id}",
                           expires_at=int((timezone.now() + timedelta(minutes=31)).timestamp()), **extra)


@override_settings(STRIPE_SECRET_KEY="sk_test_attempts", STRIPE_WEBHOOK_SECRET="whsec_attempts")
class PaymentAttemptTests(PaymentTestCase):
    def checkout(self):
        return self.client.post(f"/api/rentals/{self.rental.id}/checkout")

    def age(self, minutes=5):
        Payments.objects.update(updated_at=timezone.now() - timedelta(minutes=minutes))

    def test_retry_after_a_lost_response_reuses_the_key_and_creates_one_payment(self):
        with patch(CREATE_SESSION, side_effect=[stripe.APIConnectionError("timeout"), session()]) as create:
            self.assertEqual(self.checkout().status_code, 502)
            self.rental.refresh_from_db()
            self.assertEqual(self.rental.status, "pending")  # the tenant may retry or cancel
            response = self.checkout()
        self.assertEqual(response.status_code, 200, response.data)
        first, second = create.call_args_list
        self.assertEqual(first.kwargs, second.kwargs)  # same key and identical parameters
        self.assertTrue(first.kwargs["idempotency_key"].startswith(f"checkout:{self.rental.id}:"))
        payment = Payments.objects.get()
        self.assertEqual((payment.status, payment.session_id), ("pending", "cs_attempt"))
        self.assertEqual(first.kwargs["metadata"]["payment_id"], str(payment.pk))
        self.rental.refresh_from_db()
        self.assertEqual(self.rental.status, "awaiting_payment")
        self.assertEqual(Notification.objects.filter(title="Pagamento aguardando confirmação").count(), 2)

    def test_lost_local_save_is_healed_by_the_webhook_metadata(self):
        with patch(CREATE_SESSION, return_value=session()), \
                patch.object(PaymentService, "_attach_session", side_effect=RuntimeError("banco caiu")), \
                self.assertRaises(RuntimeError):
            self.checkout()
        attempt = Payments.objects.get()
        self.assertEqual((attempt.status, attempt.session_id), ("creating", None))
        event = {"id": "evt_heal", "type": "checkout.session.completed", "data": {"object": {
            "id": "cs_attempt", "payment_status": "paid", "payment_intent": "pi_123",
            "metadata": {"payment_id": str(attempt.pk), "rental_id": str(self.rental.pk)},
        }}}
        with patch(CONSTRUCT_EVENT, return_value=event):
            self.client.post("/api/payments/webhook", data=b"{}", content_type="application/json",
                             HTTP_STRIPE_SIGNATURE="t=1,v1=x")
        attempt.refresh_from_db()
        self.assertEqual((attempt.status, attempt.session_id, attempt.payment_intent_id),
                         ("approved", "cs_attempt", "pi_123"))
        self.rental.refresh_from_db()
        self.assertEqual(self.rental.status, "active")

    def test_duplicate_webhook_events_are_applied_once(self):
        with patch(CREATE_SESSION, return_value=session()):
            self.checkout()
        event = {"id": "evt_once", "type": "checkout.session.completed",
                 "data": {"object": {"id": "cs_attempt", "payment_status": "paid"}}}
        with patch(CONSTRUCT_EVENT, return_value=event), \
                patch.object(PaymentService, "_approve", wraps=PaymentService._approve) as approve:
            for _ in range(2):
                response = self.client.post("/api/payments/webhook", data=b"{}", content_type="application/json",
                                            HTTP_STRIPE_SIGNATURE="t=1,v1=x")
                self.assertEqual(response.status_code, 200)
        self.assertEqual(approve.call_count, 1)
        record = PaymentEvents.objects.get(pk="evt_once")
        self.assertEqual(record.attempts, 1)
        self.assertIsNotNone(record.processed_at)

    def test_a_failed_attempt_does_not_block_cancelling_the_booking(self):
        with patch(CREATE_SESSION, side_effect=stripe.APIConnectionError("timeout")):
            self.checkout()
        response = self.client.post(f"/api/rentals/{self.rental.id}/cancel", {}, format="json")
        self.assertEqual(response.status_code, 200, response.data)

    def test_reconcile_attaches_a_session_created_remotely_and_closes_abandoned_ones(self):
        with patch(CREATE_SESSION, side_effect=stripe.APIConnectionError("timeout")):
            self.checkout()
        self.age()
        with patch(CREATE_SESSION, return_value=session("cs_found")) as create:
            report = reconcile_payments()
        self.assertEqual(report.attached, 1)
        attempt = Payments.objects.get()
        self.assertEqual(create.call_args.kwargs["idempotency_key"], attempt.idempotency_key)
        self.assertEqual((attempt.status, attempt.session_id), ("pending", "cs_found"))

        # Cancelled meanwhile: the session nobody received is expired at Stripe.
        other = self.make_rental(status="pending", offset_days=10)
        self.rental = other
        with patch(CREATE_SESSION, side_effect=stripe.APIConnectionError("timeout")):
            self.checkout()
        other.status = "cancelled"
        other.save(update_fields=["status"])
        self.age()
        with patch(CREATE_SESSION, return_value=session("cs_orphan")), patch(EXPIRE_SESSION, return_value={"status": "expired"}) as expire, \
                patch(RETRIEVE_SESSION, return_value={"status": "open"}):
            report = reconcile_payments()
        expire.assert_called_once_with("cs_orphan")
        self.assertEqual(Payments.objects.get(session_id="cs_orphan").status, "expired")

    def test_reconcile_applies_missed_webhooks_and_reports_reviews(self):
        with patch(CREATE_SESSION, return_value=session()):
            self.checkout()
        self.age()
        paid = {"status": "complete", "payment_status": "paid", "payment_intent": "pi_late"}
        with patch(RETRIEVE_SESSION, return_value=paid):
            self.assertEqual(reconcile_payments().approved, 1)
        payment = Payments.objects.get()
        self.assertEqual((payment.status, payment.payment_intent_id), ("approved", "pi_late"))

        Payments.objects.update(status="requires_review")
        out = StringIO()
        call_command("reconcile_payments", stdout=out)
        self.assertIn(str(payment.pk), out.getvalue())

    def test_reconcile_marks_refused_replays_failed(self):
        with patch(CREATE_SESSION, side_effect=stripe.APIConnectionError("timeout")):
            self.checkout()
        self.age()
        with patch(CREATE_SESSION, side_effect=stripe.InvalidRequestError("expires_at no passado", param="expires_at")):
            self.assertEqual(reconcile_payments().failed, 1)
        self.assertEqual(Payments.objects.get().status, "failed")
