from datetime import timedelta
import uuid

from django.test import TestCase

from api.models import RentalRecurrence
from api.test_recurrence import RecurrenceFixtures
from rentals.models import Rentals


class RentalOperatorAssignmentTests(RecurrenceFixtures, TestCase):
    def setUp(self):
        super().setUp()
        self.rental = self.conflict(day=self.first_day + timedelta(days=40), status="pending")
        self.rental.lessee = self.tenant
        self.rental.save(update_fields=["lessee"])
        self.url = f"/api/rentals/{self.rental.pk}"

    def booking(self, *, operator, offset=0):
        day = self.first_day + timedelta(days=offset)
        return self.client.post("/api/rentals", {
            "postings": str(self.posting.pk), "lessee": str(self.tenant.pk),
            "start_date": self.at(day).isoformat(), "end_date": self.at(day, 18).isoformat(),
            "operator": str(operator.pk) if operator else None,
        }, format="json")

    def test_create_accepts_own_active_operator_and_explicit_none(self):
        assigned = self.booking(operator=self.operator)
        self.assertEqual(assigned.status_code, 201, assigned.data)
        self.assertEqual(Rentals.objects.get(pk=assigned.data["id"]).operator_id, self.operator.pk)
        unassigned = self.booking(operator=None, offset=10)
        self.assertEqual(unassigned.status_code, 201, unassigned.data)
        self.assertIsNone(Rentals.objects.get(pk=unassigned.data["id"]).operator_id)

    def test_update_can_assign_own_operator_and_clear_assignment(self):
        assigned = self.client.patch(self.url, {"operator": str(self.operator.pk)}, format="json")
        self.assertEqual(assigned.status_code, 200, assigned.data)
        self.rental.refresh_from_db()
        self.assertEqual(self.rental.operator_id, self.operator.pk)
        cleared = self.client.patch(self.url, {"operator": None}, format="json")
        self.assertEqual(cleared.status_code, 200, cleared.data)
        self.rental.refresh_from_db()
        self.assertIsNone(self.rental.operator_id)

    def test_create_and_update_reject_foreign_detached_non_operator_and_blocked_accounts(self):
        cases = [
            (self.other, "operador", "active"),
            (None, "operador", "active"),
            (self.tenant, "locatario", "active"),
            (self.tenant, "operador", "suspended"),
            (self.tenant, "operador", "banned"),
            (self.tenant, "operador", "inactive"),
        ]
        before = Rentals.objects.count()
        for employer, role, status in cases:
            with self.subTest(employer=employer, role=role, status=status):
                self.operator.employer, self.operator.role, self.operator.status = employer, role, status
                self.operator.save(update_fields=["employer", "role", "status"])
                for response in (
                    self.booking(operator=self.operator),
                    self.client.patch(self.url, {"operator": str(self.operator.pk)}, format="json"),
                ):
                    self.assertEqual(response.status_code, 400, response.data)
                    self.assertIn("operator", response.data["errors"])
                self.rental.refresh_from_db()
                self.assertIsNone(self.rental.operator_id)
        self.assertEqual(Rentals.objects.count(), before)

    def test_rescheduling_rechecks_team_membership_but_detached_assignment_can_be_cleared(self):
        self.rental.operator = self.operator
        self.rental.save(update_fields=["operator"])
        self.assertEqual(self.client.delete(f"/api/users/operators/{self.operator.pk}").status_code, 204)
        dates = {"start_date": self.at(self.first_day).isoformat(),
                 "end_date": self.at(self.first_day, 18).isoformat()}
        response = self.client.patch(self.url, dates, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        response = self.client.patch(self.url, {**dates, "operator": None}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.rental.refresh_from_db()
        self.assertIsNone(self.rental.operator_id)

    def test_legacy_unspecified_operator_status_keeps_existing_active_account_behavior(self):
        self.operator.status = None
        self.operator.save(update_fields=["status"])
        response = self.booking(operator=self.operator)
        self.assertEqual(response.status_code, 201, response.data)


class RecurrenceOperatorAssignmentTests(RecurrenceFixtures, TestCase):
    def test_operator_unlinked_after_original_rental_cannot_be_reused(self):
        self.assertEqual(self.client.delete(f"/api/users/operators/{self.operator.pk}").status_code, 204)
        for response in (self.client.post(self.preview_url, self.payload, format="json"), self.create()):
            self.assertEqual(response.status_code, 400, response.data)
            self.assertIn("operator", response.data["errors"])
        self.assertEqual(Rentals.objects.count(), 1)
        self.assertFalse(RentalRecurrence.objects.exists())
        self.source.refresh_from_db()
        self.assertEqual(self.source.operator_id, self.operator.pk, "Historical assignments are retained")

    def test_recurrence_rejects_operator_moved_to_another_team_changed_role_or_blocked(self):
        for employer, role, status in [
            (self.other, "operador", "active"),
            (self.tenant, "locatario", "active"),
            (self.tenant, "operador", "suspended"),
        ]:
            with self.subTest(employer=employer, role=role, status=status):
                self.operator.employer, self.operator.role, self.operator.status = employer, role, status
                self.operator.save(update_fields=["employer", "role", "status"])
                response = self.create()
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn("operator", response.data["errors"])
        self.assertFalse(RentalRecurrence.objects.exists())

    def test_recurrence_without_operator_is_supported(self):
        self.source.operator = None
        self.source.save(update_fields=["operator"])
        response = self.create()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertFalse(RentalRecurrence.objects.get().rentals.exclude(operator=None).exists())

    def test_idempotent_replay_after_unlink_returns_existing_series_without_new_assignments(self):
        key = str(uuid.uuid4())
        original = self.create(idempotency_key=key)
        self.assertEqual(original.status_code, 201, original.data)
        self.assertEqual(self.client.delete(f"/api/users/operators/{self.operator.pk}").status_code, 204)
        replay = self.create(idempotency_key=key)
        self.assertEqual(replay.status_code, 201, replay.data)
        self.assertEqual(replay.data, original.data)
        self.assertEqual(Rentals.objects.count(), 3)
