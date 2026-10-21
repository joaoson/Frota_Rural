"""Agreed price and hour-meter rules from ADR 0002 (fixed daily price)."""

import uuid
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from api.test_recurrence import RecurrenceFixtures
from contracts.models import Contracts
from payments.models import Payments
from rentals.models import Rentals


class AgreedPriceFixtures(RecurrenceFixtures):
    def setUp(self):
        super().setUp()
        # Audit reproduction: R$180/h for two diárias = 180 × 8 × 2 × 1,05.
        self.posting.hourly_rate = Decimal("180.00")
        self.posting.save(update_fields=["hourly_rate"])

    def booking_data(self, days=2, offset=0):
        start = self.first_day + timedelta(days=offset)
        return {
            "postings": str(self.posting.pk), "lessee": str(self.tenant.pk),
            "start_date": self.at(start).isoformat(),
            "end_date": self.at(start + timedelta(days=days - 1), 18).isoformat(),
        }

    def book(self, status="pending", *, past=False, offset=0):
        """Book through the API, then move it to `status` as payment/signing would."""
        self.client.force_authenticate(self.tenant)
        response = self.client.post("/api/rentals/", self.booking_data(offset=offset), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        rental = Rentals.objects.get(pk=response.data["id"])
        if status != "pending":
            rental.status = status
        if status in ("active", "signed", "completed"):
            Payments.objects.create(rental=rental, session_id=f"cs_{uuid.uuid4()}", amount=rental.total_price,
                                    status="approved")
        if status in ("signed", "completed"):
            Contracts.objects.filter(rental=rental).update(
                accepted_by_lessor=True, accepted_by_lessee=True, status="signed",
            )
        if past:
            rental.start_date = self.at(timezone.localdate() - timedelta(days=5))
            rental.end_date = self.at(timezone.localdate() - timedelta(days=4), 18)
        rental.save()
        return rental

    def change_listing_rate(self, rate="300.00"):
        self.posting.hourly_rate = Decimal(rate)
        self.posting.save(update_fields=["hourly_rate"])

    def assert_frozen(self, rental, total="3024.00"):
        rental.refresh_from_db()
        self.assertEqual(rental.total_price, Decimal(total))
        self.assertEqual(rental.hourly_rate_snapshot, Decimal("180.00"))
        self.assertEqual(rental.daily_rate, Decimal("1440.00"))
        self.assertEqual(rental.billable_days, 2)


class AgreedPriceTests(AgreedPriceFixtures, TestCase):
    def test_booking_freezes_the_daily_price_quote(self):
        rental = self.book()
        self.assert_frozen(rental)
        self.assertEqual(rental.subtotal, Decimal("2880.00"))
        self.assertEqual(rental.platform_fee_rate, Decimal("0.0500"))
        self.assertEqual(rental.platform_fee, Decimal("144.00"))
        self.assertIsNotNone(rental.priced_at)
        response = self.client.get(f"/api/rentals/{rental.pk}")
        self.assertEqual(response.data["daily_rate"], "1440.00")
        self.assertEqual(response.data["billable_days"], 2)

    def test_same_posting_patch_cannot_reprice_paid_signed_or_completed_rentals(self):
        for index, status in enumerate(("awaiting_payment", "active", "signed", "completed")):
            with self.subTest(status=status):
                self.change_listing_rate("180.00")
                rental = self.book(status, past=status == "completed", offset=index * 7)
                self.change_listing_rate("300.00")
                for user in (self.tenant, self.owner):
                    self.client.force_authenticate(user)
                    response = self.client.patch(
                        f"/api/rentals/{rental.pk}", {"postings": str(self.posting.pk)}, format="json",
                    )
                    self.assertEqual(response.status_code, 200, response.data)
                    self.assertEqual(response.data["total_price"], "3024.00")
                self.assert_frozen(rental)
                rental.refresh_from_db()
                self.assertEqual(rental.status, status)
                if status != "awaiting_payment":
                    self.assertEqual(rental.payments.get(status="approved").amount, rental.total_price)

    def test_same_posting_put_cannot_reprice_a_paid_rental(self):
        rental = self.book("active")
        self.change_listing_rate()
        response = self.client.put(f"/api/rentals/{rental.pk}", self.booking_data(), format="json")
        self.assertEqual(response.status_code, 409, response.data)
        self.assert_frozen(rental)

    def test_pending_booking_requotes_only_when_dates_change(self):
        rental = self.book()
        self.change_listing_rate()
        response = self.client.patch(f"/api/rentals/{rental.pk}", self.booking_data(), format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assert_frozen(rental)
        response = self.client.patch(f"/api/rentals/{rental.pk}", self.booking_data(days=3), format="json")
        self.assertEqual(response.status_code, 200, response.data)
        rental.refresh_from_db()
        self.assertEqual(rental.total_price, Decimal("7560.00"))  # 300 × 8 × 3 × 1,05
        self.assertEqual(rental.hourly_rate_snapshot, Decimal("300.00"))
        self.assertEqual(rental.billable_days, 3)

    def test_contract_document_shows_the_frozen_rate_not_the_listing_rate(self):
        rental = self.book("active")
        self.change_listing_rate()
        response = self.client.get(f"/api/contracts/{rental.pk}")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["contrato"]["valor_unitario"], "180,00")
        self.assertEqual(response.data["contrato"]["valor_locacao"], "2.880,00")
        self.assertEqual(response.data["contrato"]["valor_diaria"], "1.440,00")
        self.assertEqual(response.data["contrato"]["valor_total"], "3.024,00")

    def test_recurrence_occurrences_keep_their_own_quote(self):
        response = self.create()
        self.assertEqual(response.status_code, 201, response.data)
        self.change_listing_rate()
        for rental in Rentals.objects.filter(recurrence__isnull=False):
            self.assertEqual(rental.hourly_rate_snapshot, Decimal("180.00"))
            self.assertEqual(rental.daily_rate, Decimal("1440.00"))
            self.assertEqual(rental.billable_days, 2)
            self.assertEqual(rental.total_price, Decimal("3024.00"))
            self.assertIsNotNone(rental.priced_at)

    def test_quote_endpoint_returns_the_same_price_a_booking_freezes(self):
        self.client.force_authenticate(None)
        url = f"/api/postings/{self.posting.pk}/cotacao"
        data = self.booking_data()
        response = self.client.get(url, {"start_date": data["start_date"], "end_date": data["end_date"]})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data, {
            "tarifa_hora": "180.00", "horas_por_diaria": 8, "valor_diaria": "1440.00", "diarias": 2,
            "subtotal": "2880.00", "taxa_percentual": "0.0500", "taxa_valor": "144.00", "total": "3024.00",
        })
        self.assertEqual(response.data["total"], str(self.book().total_price))
        self.assertEqual(self.client.get(url).status_code, 400)
        reversed_dates = {"start_date": data["end_date"], "end_date": data["start_date"]}
        self.assertEqual(self.client.get(url, reversed_dates).status_code, 400)
        missing = f"/api/postings/{uuid.uuid4()}/cotacao"
        self.assertEqual(self.client.get(missing, {"start_date": data["start_date"],
                                                   "end_date": data["end_date"]}).status_code, 404)


class HourMeterRulesTests(AgreedPriceFixtures, TestCase):
    """Readings are usage metrics only: validated, never priced, never required."""

    def patch_as_owner(self, rental, data):
        self.client.force_authenticate(self.owner)
        return self.client.patch(f"/api/rentals/{rental.pk}", data, format="json")

    def test_negative_and_out_of_range_readings_are_rejected(self):
        rental = self.book("active")
        for data in ({"initial_hour_meter": -100, "final_hour_meter": -150},
                     {"initial_hour_meter": 60001},
                     {"final_hour_meter": -1}):
            with self.subTest(data=data):
                self.assertEqual(self.patch_as_owner(rental, data).status_code, 400)
        rental.refresh_from_db()
        self.assertIsNone(rental.initial_hour_meter)
        self.assertIsNone(rental.final_hour_meter)

    def test_decreasing_readings_are_rejected(self):
        rental = self.book("signed")
        response = self.patch_as_owner(rental, {"initial_hour_meter": 1000, "final_hour_meter": 900})
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("final_hour_meter", str(response.data))
        self.assertEqual(self.patch_as_owner(rental, {"initial_hour_meter": 1000}).status_code, 200)
        # The stored check-in reading still bounds a later check-out reading.
        self.assertEqual(self.patch_as_owner(rental, {"final_hour_meter": 999}).status_code, 400)
        rental.refresh_from_db()
        self.assertEqual(rental.initial_hour_meter, 1000)
        self.assertIsNone(rental.final_hour_meter)

    def test_readings_never_change_the_agreed_price_or_payment(self):
        rental = self.book("signed")
        self.change_listing_rate()
        response = self.patch_as_owner(rental, {"initial_hour_meter": 1000, "final_hour_meter": 1250})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["final_hour_meter"], 1250)
        # 250 h over two diárias is far above 8 h/day: still no extra charge.
        self.assert_frozen(rental)
        self.assertEqual(rental.payments.get().amount, Decimal("3024.00"))
        self.assertEqual(rental.payments.count(), 1)

    def test_tenant_cannot_record_readings(self):
        rental = self.book("signed")
        self.client.force_authenticate(self.tenant)
        response = self.client.patch(f"/api/rentals/{rental.pk}", {"initial_hour_meter": 10}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_completion_requires_both_signatures_but_no_readings(self):
        unsigned = self.book("active", past=True)
        response = self.patch_as_owner(unsigned, {"status": "completed"})
        self.assertEqual(response.status_code, 409, response.data)
        self.assertIn("assinarem", str(response.data))
        unsigned.refresh_from_db()
        self.assertEqual(unsigned.status, "active")

        Contracts.objects.filter(rental=unsigned).update(accepted_by_lessor=True, accepted_by_lessee=True,
                                                         status="signed")
        unsigned.status = "signed"
        unsigned.save(update_fields=["status"])
        response = self.patch_as_owner(unsigned, {"status": "completed"})
        self.assertEqual(response.status_code, 200, response.data)
        unsigned.refresh_from_db()
        self.assertEqual(unsigned.status, "completed")
        self.assertIsNone(unsigned.initial_hour_meter)
        self.assert_frozen(unsigned)

    def test_signed_rental_cannot_complete_before_its_end_date(self):
        rental = self.book("signed")
        self.assertEqual(self.patch_as_owner(rental, {"status": "completed"}).status_code, 409)
