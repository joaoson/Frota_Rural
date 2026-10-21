"""PR H: políticas, repetição, pagamentos tardios e estornos sem reabrir datas."""
from datetime import timedelta
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

import stripe
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone

from contracts.models import ContractSignatureOtps
from contracts.revisions import freeze_initial_revision
from contracts.tests import ContractTestCase, auth, make_user
from notifications.models import Notification
from payments.availability import tem_conflito
from payments.models import Payments, RefundAttempts, Refunds
from payments.refunds import RefundService, reconcile_refunds
from payments.services import PaymentService
from rentals.models import Rentals
from rentals.policy import cancellation_quote


@override_settings(CONTRACT_SIGNATURE_REQUIRE_OTP=False)
class CancellationTests(ContractTestCase):
    def setUp(self):
        super().setUp()
        self.payment = Payments.objects.get(rental=self.rental)
        self.payment.payment_intent_id = "pi_cancellation"
        self.payment.save()
        self.url = f"/api/rentals/{self.rental.pk}"
        patcher = patch("payments.refunds._provider")
        self.provider = patcher.start().return_value
        self.addCleanup(patcher.stop)
        self.provider.Refund.create.side_effect = lambda **kw: {
            "id": f"re_{kw['metadata']['attempt_id']}", "status": "succeeded",
            "amount": kw["amount"], "metadata": kw["metadata"],
        }

    def cancel(self, user=None):
        return self.client.post(f"{self.url}/cancel", {"reason": "Mudança de planos"},
                                content_type="application/json", **auth(user or self.lessee))

    def test_quote_boundaries_and_owner_policy(self):
        now = timezone.now()
        for days, expected in ((8, "2520.00"), (7, "2520.00"), (6, "2268.00")):
            self.rental.start_date = now + timedelta(days=days)
            self.assertEqual(cancellation_quote(self.rental, self.lessee, now)["refund_amount"], expected)
        self.assertEqual(cancellation_quote(self.rental, self.owner, now)["refund_amount"], "2520.00")
        self.rental.start_date = now
        self.assertFalse(cancellation_quote(self.rental, self.lessee, now)["allowed"])

    def test_paid_cancellation_releases_dates_and_retains_ten_percent(self):
        self.assertTrue(tem_conflito(self.rental.postings_id, self.rental.start_date, self.rental.end_date))
        response = self.cancel()
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["status"], "cancelled")
        self.assertEqual(response.json()["refunds"][0]["amount"], "2268.00")
        self.assertEqual(response.json()["refunds"][0]["status"], "succeeded")
        self.assertFalse(tem_conflito(self.rental.postings_id, self.rental.start_date, self.rental.end_date))
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, "partially_refunded")
        self.contract.refresh_from_db()
        self.assertEqual(self.contract.status, "cancelled")
        self.assertTrue(Notification.objects.filter(message__contains=self.lessee.name).exists())

    def test_owner_gets_full_refund_and_duplicate_cancel_does_not_send_twice(self):
        self.assertEqual(self.cancel(self.owner).status_code, 200)
        self.assertEqual(self.cancel(self.owner).status_code, 200)
        self.provider.Refund.create.assert_called_once()
        self.assertEqual(Refunds.objects.get().amount, Decimal("2520.00"))
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, "refunded")

    def test_unpaid_cancel_never_calls_refund_provider(self):
        self.payment.delete()
        Rentals.objects.filter(pk=self.rental.pk).update(status="pending")
        self.assertEqual(self.cancel().status_code, 200)
        self.assertFalse(Refunds.objects.exists())
        self.provider.Refund.create.assert_not_called()

    def test_open_checkout_must_expire_before_dates_are_released(self):
        self.payment.status = "pending"
        self.payment.save()
        Rentals.objects.filter(pk=self.rental.pk).update(status="awaiting_payment")
        with patch("rentals.cancellation._stripe") as provider:
            provider.return_value.checkout.Session.retrieve.return_value = {"status": "open"}
            provider.return_value.checkout.Session.expire.return_value = {"status": "expired"}
            self.assertEqual(self.cancel().status_code, 200)
            provider.return_value.checkout.Session.expire.assert_called_once_with(self.payment.session_id)
        self.assertFalse(Refunds.objects.exists())

    def test_completed_checkout_returns_conflict_without_canceling(self):
        self.payment.status = "pending"
        self.payment.save()
        with patch("rentals.cancellation._stripe") as provider:
            provider.return_value.checkout.Session.retrieve.return_value = {"status": "complete"}
            self.assertEqual(self.cancel().status_code, 409)
            provider.return_value.checkout.Session.expire.assert_not_called()
        self.rental.refresh_from_db()
        self.assertEqual(self.rental.status, "active")

    def test_after_start_only_admin_can_cancel(self):
        Rentals.objects.filter(pk=self.rental.pk).update(start_date=timezone.now() - timedelta(minutes=1))
        self.assertEqual(self.cancel().status_code, 403)
        self.assertEqual(self.cancel(self.owner).status_code, 403)
        self.assertEqual(self.cancel(make_user("admin", 55)).status_code, 200)
        self.assertEqual(Refunds.objects.get().amount, Decimal("2520.00"))

    def test_other_users_cannot_preview_or_cancel(self):
        self.assertEqual(self.client.get(f"{self.url}/cancellation", **auth(self.stranger)).status_code, 404)
        self.assertEqual(self.cancel(self.stranger).status_code, 404)

    def test_generic_status_patch_is_retired(self):
        for status in ("cancelled", "completed"):
            response = self.client.patch(self.url, {"status": status}, content_type="application/json")
            self.assertEqual(response.status_code, 409)
            self.assertEqual(response.json()["code"], "use_rental_action")

    def test_network_failure_then_retry_reuses_the_original_key_and_released_dates(self):
        self.provider.Refund.create.side_effect = stripe.APIConnectionError("Resposta perdida")
        self.assertEqual(self.cancel().status_code, 200)
        key = self.provider.Refund.create.call_args.kwargs["idempotency_key"]
        refund = Refunds.objects.get()
        self.assertEqual(refund.status, "failed")
        self.rental.refresh_from_db()
        self.assertEqual(self.rental.status, "cancelled")
        self.provider.Refund.create.side_effect = lambda **kw: {"id": "re_recovered", "status": "succeeded", "amount": kw["amount"]}
        reconcile_refunds()
        self.assertEqual(self.provider.Refund.create.call_args.kwargs["idempotency_key"], key)
        self.assertEqual(RefundAttempts.objects.count(), 1)
        refund.refresh_from_db()
        self.assertEqual(refund.status, "succeeded")

    def test_confirmed_provider_failure_allows_new_attempt_without_reusing_failed_refund(self):
        self.provider.Refund.create.side_effect = lambda **kw: {"id": "re_failed", "status": "failed", "amount": kw["amount"]}
        self.cancel()
        first_key = self.provider.Refund.create.call_args.kwargs["idempotency_key"]
        self.provider.Refund.create.side_effect = lambda **kw: {"id": "re_retry", "status": "succeeded", "amount": kw["amount"]}
        reconcile_refunds()
        self.assertNotEqual(self.provider.Refund.create.call_args.kwargs["idempotency_key"], first_key)
        self.assertEqual(RefundAttempts.objects.count(), 2)
        self.assertEqual(Refunds.objects.get().status, "succeeded")
        # Um evento tardio da tentativa anterior não muda o resultado da atual.
        RefundService.apply({"id": "re_failed", "status": "failed", "amount": 226800})
        self.assertEqual(Refunds.objects.get().status, "succeeded")

    def test_late_payment_is_refunded_once_without_reopening_rental(self):
        self.payment.status = "creating"
        self.payment.save()
        Rentals.objects.filter(pk=self.rental.pk).update(status="pending")
        self.assertEqual(self.cancel().status_code, 200)
        with self.captureOnCommitCallbacks(execute=True):
            PaymentService._approve(self.payment.session_id, payment_intent="pi_cancellation")
            PaymentService._approve(self.payment.session_id, payment_intent="pi_cancellation")
        self.assertEqual(Refunds.objects.get().amount, Decimal("2520.00"))
        self.provider.Refund.create.assert_called_once()
        self.rental.refresh_from_db()
        self.assertEqual(self.rental.status, "cancelled")

    def test_refund_webhook_replays_and_out_of_order_updates_do_not_regress_success(self):
        self.cancel()
        refund = Refunds.objects.get()
        obj = {"id": refund.provider_refund_id, "status": "succeeded", "amount": 226800}
        self.provider.Refund.retrieve.return_value = obj
        event = {"id": "evt_refund", "type": "refund.updated", "data": {"object": obj}}
        with override_settings(STRIPE_WEBHOOK_SECRET="whsec_test"), patch("payments.services._stripe") as provider:
            provider.return_value.Webhook.construct_event.return_value = event
            PaymentService.handle_webhook(b"{}", "test")
            PaymentService.handle_webhook(b"{}", "test")
        self.provider.Refund.retrieve.assert_called_once()
        RefundService.apply({**obj, "status": "pending"})
        self.assertEqual(Refunds.objects.get().status, "succeeded")

    def test_deadline_rejects_signing_and_otp_then_cancels_once_with_full_refund(self):
        freeze_initial_revision(self.contract)
        self.contract.signature_deadline = timezone.now() - timedelta(seconds=1)
        self.contract.save(update_fields=["signature_deadline"])
        self.assertEqual(self.sign("locatario").status_code, 409)
        response = self.client.post(f"/api/contracts/{self.contract.pk}/otp", {
            "role": "locatario", "revision_id": str(self.contract.current_revision_id),
        }, content_type="application/json")
        self.assertEqual(response.status_code, 409)
        self.assertFalse(ContractSignatureOtps.objects.exists())
        call_command("expire_unsigned_contracts", stdout=StringIO())
        call_command("expire_unsigned_contracts", stdout=StringIO())
        self.assertEqual(Refunds.objects.get().amount, Decimal("2520.00"))
        self.provider.Refund.create.assert_called_once()

    def test_checkout_response_after_cancel_is_closed_without_returning_payment_link(self):
        from types import SimpleNamespace
        from common.exceptions import Conflict
        Payments.objects.filter(pk=self.payment.pk).update(status="creating", session_id=None)
        Rentals.objects.filter(pk=self.rental.pk).update(status="pending")
        self.assertEqual(self.cancel().status_code, 200)
        with patch("payments.services._stripe") as provider:
            provider.return_value.checkout.Session.retrieve.return_value = {"status": "open"}
            provider.return_value.checkout.Session.expire.return_value = {"status": "expired"}
            with self.assertRaises(Conflict):
                PaymentService._attach_session(self.payment.pk, SimpleNamespace(id="cs_cancelled", url="https://checkout.test"))
        self.payment.refresh_from_db()
        self.rental.refresh_from_db()
        self.assertEqual(self.payment.status, "expired")
        self.assertEqual(self.rental.status, "cancelled")
        self.assertIsNone(self.rental.reservation_expires_at)

    def test_reconcile_refunds_a_completed_checkout_on_a_cancelled_rental(self):
        from payments.reconcile import reconcile_payments
        Payments.objects.filter(pk=self.payment.pk).update(status="pending", session_id="cs_late", updated_at=timezone.now() - timedelta(minutes=5))
        Rentals.objects.filter(pk=self.rental.pk).update(status="cancelled")
        with patch("payments.services._stripe") as provider, patch("payments.reconcile._stripe", return_value=provider.return_value):
            provider.return_value.checkout.Session.retrieve.return_value = {"status": "complete", "payment_status": "paid", "payment_intent": "pi_cancellation"}
            with self.captureOnCommitCallbacks(execute=True):
                self.assertEqual(reconcile_payments().approved, 1)
        self.assertEqual(Refunds.objects.get().amount, self.payment.amount)
        self.assertEqual(Refunds.objects.get().status, "succeeded")

    def test_old_uncertain_refund_recovers_by_metadata_without_resending_expired_key(self):
        self.provider.Refund.create.side_effect = stripe.APIConnectionError("Resposta perdida")
        self.cancel()
        attempt = RefundAttempts.objects.get()
        RefundAttempts.objects.filter(pk=attempt.pk).update(created_at=timezone.now() - timedelta(days=2))
        self.provider.Refund.list.return_value.auto_paging_iter.return_value = iter([
            {"id": "re_recovered", "status": "succeeded", "amount": 226800, "metadata": {"attempt_id": str(attempt.pk)}}])
        reconcile_refunds()
        self.assertEqual(Refunds.objects.get().status, "succeeded")
        self.provider.Refund.create.assert_called_once()
