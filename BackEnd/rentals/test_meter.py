"""Hour-meter readings are usage metrics only (ADR 0002, plan phase 3)."""

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from notifications.models import Notification
from rentals.models import RentalMeterReadings, Rentals
from rentals.test_agreed_price import AgreedPriceFixtures


class MeterFixtures(AgreedPriceFixtures):
    def started(self, status="signed", *, ended=False, offset=0):
        """A booked, paid rental moved into its period, as time would."""
        rental = self.book(status, offset=offset)
        today = timezone.localdate()
        rental.start_date = self.at(today - timedelta(days=3 if ended else 0), 0)
        rental.end_date = self.at(today - timedelta(days=2), 18) if ended else self.at(today + timedelta(days=1), 18)
        rental.save(update_fields=["start_date", "end_date"])
        return rental

    def record(self, rental, kind, value, user=None, **extra):
        self.client.force_authenticate(user or self.owner)
        return self.client.post(f"/api/rentals/{rental.pk}/meter-readings",
                                {"kind": kind, "value": value, **extra}, format="json")


class MeterReadingTests(MeterFixtures, TestCase):
    def test_owner_records_check_in_and_check_out_as_usage_only(self):
        rental = self.started()
        response = self.record(rental, "check_in", 1000, note="Painel ok")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["rental"]["meter"]["check_in"]["value"], 1000)
        self.change_listing_rate()
        response = self.record(rental, "check_out", 1250)
        self.assertEqual(response.status_code, 201, response.data)
        meter = response.data["rental"]["meter"]
        # 250 h in two diárias is far above the 16 h reference: still no extra charge.
        self.assertEqual((meter["hours_used"], meter["reference_hours"]), (250, 16))
        self.assert_frozen(rental)
        self.assertEqual(rental.payments.get().amount, Decimal("3024.00"))
        self.assertEqual(rental.payments.count(), 1)
        rental.refresh_from_db()
        self.assertEqual((rental.initial_hour_meter, rental.final_hour_meter), (1000, 1250))
        self.assertEqual(Notification.objects.filter(title="Horímetro registrado na devolução").count(), 2)

    def test_invalid_readings_are_rejected(self):
        rental = self.started()
        for value in (-1, 60001, "12.5", "abc"):
            with self.subTest(value=value):
                self.assertEqual(self.record(rental, "check_in", value).status_code, 400)
        response = self.record(rental, "check_out", 10)
        self.assertEqual(response.status_code, 400)
        self.assertIn("retirada antes da devolução", str(response.data))
        self.assertEqual(self.record(rental, "check_in", 1000).status_code, 201)
        response = self.record(rental, "check_out", 999)
        self.assertEqual(response.status_code, 400)
        self.assertIn("não pode ser menor", str(response.data))
        self.assertFalse(RentalMeterReadings.objects.filter(kind="check_out").exists())

    def test_correction_keeps_history_and_stays_consistent(self):
        rental = self.started()
        self.record(rental, "check_in", 1000)
        self.record(rental, "check_out", 1100)
        self.assertEqual(self.record(rental, "check_in", 1200).status_code, 400)
        response = self.record(rental, "check_in", 1010, note="corrigido")
        self.assertEqual(response.status_code, 201)
        first, second = RentalMeterReadings.objects.filter(kind="check_in").order_by("recorded_at")
        self.assertEqual(second.supersedes, first)
        self.assertEqual(response.data["rental"]["meter"]["hours_used"], 90)
        self.client.force_authenticate(self.tenant)
        history = self.client.get(f"/api/rentals/{rental.pk}/meter-readings").data
        self.assertEqual([row["value"] for row in history], [1000, 1100, 1010])

    def test_only_the_owner_of_a_signed_started_rental_records(self):
        rental = self.started()
        self.assertEqual(self.record(rental, "check_in", 10, user=self.tenant).status_code, 403)
        self.assertEqual(self.record(rental, "check_in", 10, user=self.other).status_code, 404)
        unsigned = self.started("active", offset=7)
        self.assertEqual(self.record(unsigned, "check_in", 10).status_code, 409)
        future = self.book("signed", offset=14)
        response = self.record(future, "check_in", 10)
        self.assertEqual(response.status_code, 409)
        self.assertIn("primeiro dia", str(response.data))

    def test_machine_meter_below_the_reading_is_a_warning_not_an_error(self):
        machine = self.posting.machinery
        machine.hour_meter = 5000
        machine.save(update_fields=["hour_meter"])
        response = self.record(self.started(), "check_in", 4000)
        self.assertEqual(response.status_code, 201)
        self.assertIn("5000 h", response.data["warnings"][0])
        machine.refresh_from_db()
        self.assertEqual(machine.hour_meter, 5000)  # readings never feed the owner's price suggestion

    def test_generic_patch_no_longer_writes_readings(self):
        rental = self.started()
        self.client.force_authenticate(self.owner)
        response = self.client.patch(f"/api/rentals/{rental.pk}", {"initial_hour_meter": 10}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("meter-readings", str(response.data))


class CompletionTests(MeterFixtures, TestCase):
    def complete(self, rental, user=None, **body):
        self.client.force_authenticate(user or self.owner)
        return self.client.post(f"/api/rentals/{rental.pk}/complete", body, format="json")

    def test_owner_completes_after_both_signatures_and_end_date_without_readings(self):
        rental = self.started(ended=True)
        response = self.complete(rental)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual((response.data["status"], response.data["phase"]), ("completed", "concluida"))
        self.assertIsNone(response.data["meter"]["check_out"])
        self.assert_frozen(rental)

    def test_completion_can_record_the_check_out_reading(self):
        rental = self.started(ended=True)
        self.record(rental, "check_in", 500)
        response = self.complete(rental, final_hour_meter=530)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["meter"]["hours_used"], 30)
        response = self.complete(self.started(ended=True, offset=7), final_hour_meter=10)
        self.assertEqual(response.status_code, 400)  # check-out without check-in is refused, nothing completes
        self.assertEqual(Rentals.objects.filter(status="completed").exclude(pk=self.source.pk).count(), 1)

    def test_completion_guards(self):
        unsigned = self.started("active", ended=True)
        response = self.complete(unsigned)
        self.assertEqual(response.status_code, 409)
        self.assertIn("assinarem", str(response.data))
        self.assertEqual(self.complete(self.started(offset=7)).status_code, 409)  # period still running
        self.assertEqual(self.complete(self.started(ended=True, offset=14), user=self.tenant).status_code, 409)
        self.assertFalse(Rentals.objects.filter(status="completed").exclude(pk=self.source.pk).exists())


class MachineUsageTests(MeterFixtures, TestCase):
    def test_owner_sees_hours_registered_over_completed_rentals(self):
        measured = self.started(ended=True)
        self.record(measured, "check_in", 500)
        self.client.post(f"/api/rentals/{measured.pk}/complete", {"final_hour_meter": 530}, format="json")
        unmeasured = self.started(ended=True, offset=7)  # booking switches the client to the tenant
        self.client.force_authenticate(self.owner)
        self.client.post(f"/api/rentals/{unmeasured.pk}/complete", {}, format="json")

        url = f"/api/machines/{self.posting.machinery_id}/usage"
        usage = self.client.get(url).data
        # The fixture's earlier completed rental (no readings) counts as a rental, not as measured hours.
        self.assertEqual(usage["locacoes_concluidas"], 3)
        self.assertEqual(usage["diarias"], 6)
        self.assertEqual((usage["locacoes_com_leitura"], usage["horas_registradas"]), (1, 30))
        self.assertEqual(usage["media_horas_por_diaria"], "15.0")
        self.assertEqual(usage["referencia_horas_por_diaria"], 8)
        self.assertEqual(usage["ultima_leitura"]["valor"], 530)
        self.client.force_authenticate(self.tenant)
        self.assertEqual(self.client.get(url).status_code, 404)
