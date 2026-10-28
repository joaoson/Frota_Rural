"""One lifecycle meaning and one booking policy for every path (plan steps 4.2 and 4.3)."""

import uuid
from unittest.mock import patch
from datetime import datetime, time, timedelta

from django.test import TestCase
from django.utils import timezone

from api.test_recurrence import RecurrenceFixtures
from contracts.models import Contracts
from payments.models import Payments
from rentals import lifecycle, policy
from rentals.models import Rentals


class BookingPolicyTests(RecurrenceFixtures, TestCase):
    def booking(self, start_day, *, hour=8, **extra):
        start = timezone.make_aware(datetime.combine(start_day, time(hour)))
        return {"postings": str(self.posting.pk), "lessee": str(self.tenant.pk),
                "start_date": start.isoformat(), "end_date": (start + timedelta(hours=10)).isoformat(), **extra}

    def post(self, data, user=None):
        self.client.force_authenticate(user or self.tenant)
        return self.client.post("/api/rentals/", data, format="json")

    def test_single_booking_needs_seven_days_of_notice(self):
        today = timezone.localdate()
        # Freeze before 08:00 so same-day input exercises notice, not past dates.
        with patch("django.utils.timezone.now", return_value=timezone.make_aware(datetime.combine(today, time.min))):
            for days in (0, 1, 6):
                with self.subTest(days=days):
                    response = self.post(self.booking(today + timedelta(days=days)))
                    self.assertEqual(response.status_code, 400, response.data)
                    self.assertIn("7 dias de antecedência", str(response.data))
            self.assertEqual(self.post(self.booking(today + timedelta(days=7))).status_code, 201)

    def test_notice_is_counted_in_server_dates_at_the_day_boundary(self):
        earliest = policy.earliest_start_date()
        self.assertEqual(self.post(self.booking(earliest, hour=0)).status_code, 201)
        late_day_before = self.booking(earliest - timedelta(days=1), hour=23)
        self.assertEqual(self.post(late_day_before).status_code, 400)

    def test_date_change_and_recurrence_apply_the_same_notice(self):
        response = self.post(self.booking(timezone.localdate() + timedelta(days=30)))
        moved = self.booking(timezone.localdate() + timedelta(days=3))
        response = self.client.patch(f"/api/rentals/{response.data['id']}",
                                     {"start_date": moved["start_date"], "end_date": moved["end_date"]}, format="json")
        self.assertEqual(response.status_code, 400, response.data)

        self.client.force_authenticate(self.tenant)
        soon = str(timezone.localdate() + timedelta(days=3))
        response = self.client.post(self.preview_url, {**self.payload, "first_start_date": soon}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("first_start_date", str(response.data))

    def test_only_tenants_and_admins_book_and_never_their_own_machine(self):
        day = timezone.localdate() + timedelta(days=20)
        for user in (self.owner, self.operator):
            with self.subTest(role=user.role):
                response = self.post(self.booking(day, lessee=str(user.pk)), user=user)
                self.assertEqual(response.status_code, 403, response.data)
        self.owner.role = "admin"
        self.owner.save(update_fields=["role"])
        response = self.post(self.booking(day, lessee=str(self.owner.pk)), user=self.owner)
        self.assertEqual(response.status_code, 403)
        self.assertIn("própria máquina", str(response.data))
        self.assertFalse(Rentals.objects.filter(lessee=self.owner).exists())

    def test_policy_endpoint_publishes_the_server_rule(self):
        self.client.force_authenticate(None)
        response = self.client.get("/api/rentals/policy")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"antecedencia_minima_dias": 7,
                                         "data_minima_inicio": policy.earliest_start_date().isoformat()})

    def test_booking_notes_persist_and_reach_the_owner(self):
        day = timezone.localdate() + timedelta(days=20)
        response = self.post(self.booking(day, notes="Retirar pela porteira dos fundos."))
        self.assertEqual(response.status_code, 201, response.data)
        url = f"/api/rentals/{response.data['id']}"
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(url).data["notes"], "Retirar pela porteira dos fundos.")
        self.assertEqual(self.client.patch(url, {"notes": "do locador"}, format="json").status_code, 403)
        self.client.force_authenticate(self.tenant)
        self.assertEqual(self.client.patch(url, {"notes": "Ligar antes."}, format="json").data["notes"], "Ligar antes.")
        self.assertEqual(self.client.patch(url, {"notes": "x" * 1001}, format="json").status_code, 400)


class LifecycleTests(RecurrenceFixtures, TestCase):
    def rental(self, status, *, start_in_days=20, days=2, signed=False, payment=None, **fields):
        start = timezone.now() + timedelta(days=start_in_days)
        rental = Rentals.objects.create(
            id=uuid.uuid4(), postings=self.posting, lessee=self.tenant, start_date=start,
            end_date=start + timedelta(days=days), status=status, created_at=timezone.now(), **fields,
        )
        Contracts.objects.create(id=uuid.uuid4(), rental=rental, status="signed" if signed else "pending_signatures",
                                 accepted_by_lessee=signed, accepted_by_lessor=signed, created_at=timezone.now())
        if payment:
            Payments.objects.create(rental=rental, session_id=f"cs_{uuid.uuid4()}", amount="10.00", status=payment)
        return Rentals.objects.select_related("contracts", "postings__machinery").prefetch_related("payments").get(pk=rental.pk)

    def view(self, rental):
        return {
            "phase": lifecycle.phase(rental),
            "tenant": set(lifecycle.allowed_actions(rental, self.tenant)),
            "owner": set(lifecycle.allowed_actions(rental, self.owner)),
            "other": lifecycle.allowed_actions(rental, self.other),
        }

    def test_each_stored_status_has_one_meaning_and_its_actions(self):
        cases = [
            (self.rental("pending"), "reserva", {"pay", "cancel", "edit_dates"}, {"cancel"}),
            (self.rental("awaiting_payment", payment="pending"), "aguardando_pagamento", {"pay", "cancel"}, {"cancel"}),
            (self.rental("active", payment="approved"), "aguardando_assinaturas", {"sign", "cancel"}, {"sign", "cancel"}),
            (self.rental("signed", signed=True, payment="approved"), "pronta_para_entrega", {"cancel"}, {"cancel"}),
            (self.rental("signed", start_in_days=-1, signed=True, payment="approved"), "em_uso", set(),
             {"record_check_in"}),
            (self.rental("signed", start_in_days=-1, signed=True, initial_hour_meter=10), "em_uso", set(),
             {"record_check_in", "record_check_out"}),
            (self.rental("signed", start_in_days=-5, days=1, signed=True), "devolvida", set(),
             {"record_check_in", "complete"}),
            (self.rental("completed", start_in_days=-5, days=1, signed=True), "concluida", {"review"}, {"review"}),
            (self.rental("cancelled"), "cancelada", set(), set()),
        ]
        for rental, phase, tenant, owner in cases:
            with self.subTest(status=rental.status, phase=phase):
                view = self.view(rental)
                self.assertEqual(view["phase"], phase)
                self.assertEqual(view["tenant"], tenant)
                self.assertEqual(view["owner"], owner)
                self.assertEqual(view["other"], [])

    def test_api_returns_phase_and_actions_for_the_requesting_party(self):
        rental = self.rental("active", payment="approved")
        self.client.force_authenticate(self.owner)
        data = self.client.get(f"/api/rentals/{rental.pk}").data
        self.assertEqual((data["phase"], data["phase_label"]), ("aguardando_assinaturas", "Aguardando assinaturas"))
        self.assertEqual(data["allowed_actions"], ["cancel", "sign"])
        listed = next(row for row in self.client.get("/api/rentals/").data if row["id"] == str(rental.pk))
        self.assertEqual(listed["allowed_actions"], ["cancel", "sign"])
