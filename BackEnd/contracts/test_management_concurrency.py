"""PostgreSQL: pagamento/cancelamento e reserva/aditivo disputam os mesmos locks."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from unittest.mock import patch
from uuid import uuid4

from django.db import close_old_connections
from django.test import TransactionTestCase, skipUnlessDBFeature
from rest_framework.test import APIClient

from api.test_recurrence import RecurrenceFixtures
from contracts.amendments import AmendmentService
from contracts.models import Contracts, ContractRevisions
from contracts.revisions import freeze_revision
from payments.models import Payments, Refunds
from payments.services import PaymentService
from rentals.cancellation import CancellationService
from rentals.models import Rentals


@skipUnlessDBFeature("has_select_for_update")
class ManagementConcurrencyTests(RecurrenceFixtures, TransactionTestCase):
    def setUp(self):
        super().setUp()
        self.rental = self.conflict(status="pending")
        self.rental.lessee = self.tenant
        self.rental.total_price = "840.00"
        self.rental.save()
        self.contract = Contracts.objects.create(id=uuid4(), rental=self.rental, status="pending_signatures")
        self.payment = Payments.objects.create(rental=self.rental, amount="840.00", status="creating",
                                               payment_intent_id="pi_race", idempotency_key="race")

    def race(self, first, second):
        barrier = Barrier(2)
        def run(operation):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                return operation()
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(run, first), pool.submit(run, second)]
            return [future.result(timeout=20) for future in futures]

    def test_payment_and_cancellation_leave_one_refund_and_never_reopen_booking(self):
        def result(**kwargs):
            return {"id": "re_race", "amount": kwargs["amount"], "status": "succeeded"}
        with patch("payments.refunds._provider") as provider:
            provider.return_value.Refund.create.side_effect = result
            self.race(
                lambda: CancellationService.cancel(self.rental.pk, {}, user=self.tenant),
                lambda: PaymentService._approve("cs_race", payment_id=str(self.payment.pk), payment_intent="pi_race"),
            )
            keys = {call.kwargs["idempotency_key"] for call in provider.return_value.Refund.create.call_args_list}
        self.rental.refresh_from_db()
        self.payment.refresh_from_db()
        self.assertEqual(self.rental.status, "cancelled")
        self.assertIsNone(self.rental.reservation_expires_at)
        self.assertEqual(self.payment.status, "refunded")
        self.assertEqual(Refunds.objects.get().status, "succeeded")
        self.assertEqual(Refunds.objects.get().attempts.count(), 1)
        self.assertEqual(len(keys), 1)

    def test_booking_and_amendment_cannot_both_occupy_the_proposed_period(self):
        self.rental.status = "active"
        self.rental.save()
        self.payment.status = "approved"
        self.payment.save()
        self.contract.rental = self.rental
        revision = freeze_revision(self.contract)
        start, end = self.rental.start_date + timedelta(days=20), self.rental.end_date + timedelta(days=20)
        amendment = AmendmentService.propose(self.contract.pk, {
            "base_revision": str(revision.pk), "proposed_start": start.isoformat(),
            "proposed_end": end.isoformat(), "reason": "Colheita",
        }, actor=self.tenant)
        def accept():
            client = APIClient()
            client.force_authenticate(self.owner)
            return client.post(f"/api/contracts/{self.contract.pk}/amendments/{amendment.pk}/accept", {}, format="json").status_code
        def book():
            client = APIClient()
            client.force_authenticate(self.other)
            return client.post("/api/rentals/", {"postings": str(self.posting.pk), "lessee": str(self.other.pk),
                "start_date": start.isoformat(), "end_date": end.isoformat()}, format="json").status_code
        accepted, booked = self.race(accept, book)
        self.assertIn((accepted, booked), ((200, 400), (409, 201)))
        self.assertEqual(Rentals.objects.filter(start_date=start).count(), 1)
        self.assertEqual(ContractRevisions.objects.filter(contract=self.contract).count(), 2 if accepted == 200 else 1)
