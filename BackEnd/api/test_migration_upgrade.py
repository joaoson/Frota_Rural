"""Upgrade both deployed histories without losing rental relationships."""

import uuid
from datetime import date, timedelta
from decimal import Decimal

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone


class RentalMigrationUpgradeTests(TransactionTestCase):
    def setUp(self):
        self.latest = MigrationExecutor(connection).loader.graph.leaf_nodes()
        self.addCleanup(self.restore_latest)
        # This shared ancestor reverses both independent rental branches.
        self.migrate([("api", "0004_move_messages_to_chat_app"), ("rentals", None)])

    def migrate(self, targets):
        executor = MigrationExecutor(connection)
        executor.loader.check_consistent_history(connection)
        return executor.migrate(targets)

    def restore_latest(self):
        self.migrate(self.latest)

    def seed_history(self, state, *, recurrence):
        apps = state.apps
        rental_app = "api" if ("api", "rentals") in state.models else "rentals"
        User = apps.get_model("users", "Users")
        owner = User.objects.create(
            id=uuid.uuid4(), name="Migration owner", email="owner@migration.test",
            document="migration-owner", role="locador", address="Test street",
            birth_date=date(1990, 1, 1),
        )
        tenant = User.objects.create(
            id=uuid.uuid4(), name="Migration tenant", email="tenant@migration.test",
            document="migration-tenant", role="locatario", address="Test street",
            birth_date=date(1990, 1, 1),
        )
        machine = apps.get_model("machines", "Machines").objects.create(
            id=uuid.uuid4(), owner_id=owner.pk, brand="John Deere", model="S790",
        )
        posting = apps.get_model("postings", "Postings").objects.create(
            id=uuid.uuid4(), machinery_id=machine.pk, hourly_rate="100.00", status="active",
        )
        Rental = apps.get_model(rental_app, "Rentals")
        now = timezone.now()
        rental = Rental.objects.create(
            id=uuid.uuid4(), postings_id=posting.pk, lessee_id=tenant.pk,
            start_date=now + timedelta(days=10), end_date=now + timedelta(days=11),
            total_price="2400.00", status="awaiting_payment",
        )
        contract = apps.get_model("contracts", "Contracts").objects.create(
            id=uuid.uuid4(), rental_id=rental.pk, status="pending_signatures",
        )
        self.ids = {"rental": rental.pk, "contract": contract.pk, "tenant": tenant.pk}
        if recurrence:
            series = apps.get_model("api", "RentalRecurrence").objects.create(
                id=uuid.uuid4(), source_rental_id=rental.pk, lessee_id=tenant.pk,
                first_start_date=(now + timedelta(days=10)).date(), frequency="weekly",
                occurrences=2, idempotency_key=uuid.uuid4(), total_price="4800.00",
            )
            self.expires_at = now + timedelta(minutes=30)
            rental.recurrence_id = series.pk
            rental.recurrence_index = 1
            rental.reservation_expires_at = self.expires_at
            rental.save()
            notification = apps.get_model("notifications", "Notification").objects.create(
                recipient_id=tenant.pk, rental_id=rental.pk, contract_id=contract.pk,
                kind="rental", title="Reserva", message="Migration fixture", event_key="migration",
            )
            self.ids.update(series=series.pk, notification=notification.pk)

    def assert_upgraded(self, *, recurrence):
        self.restore_latest()
        from api.models import RentalRecurrence
        from contracts.models import Contracts
        from notifications.models import Notification
        from rentals.models import Rentals

        rental = Rentals.objects.get(pk=self.ids["rental"])
        self.assertEqual(rental.total_price, Decimal("2400.00"))
        self.assertEqual(rental.lessee_id, self.ids["tenant"])
        self.assertEqual(Contracts.objects.get(pk=self.ids["contract"]).rental_id, rental.pk)
        if recurrence:
            self.assertEqual(rental.recurrence_id, self.ids["series"])
            self.assertEqual(rental.recurrence_index, 1)
            self.assertEqual(rental.reservation_expires_at, self.expires_at)
            self.assertEqual(RentalRecurrence.objects.get(pk=self.ids["series"]).source_rental_id, rental.pk)
            self.assertEqual(Notification.objects.get(pk=self.ids["notification"]).rental_id, rental.pk)
        else:
            self.assertIsNone(rental.recurrence_id)
            self.assertIsNone(rental.reservation_expires_at)

    def test_upgrade_existing_recurrence_and_notification_database(self):
        state = self.migrate([
            ("api", "0006_rental_reservation_expiry"),
            ("notifications", "0001_initial"),
        ])
        self.assertNotIn(("rentals", "rentals"), state.models)
        self.seed_history(state, recurrence=True)
        self.assert_upgraded(recurrence=True)

    def test_upgrade_existing_develop_database(self):
        state = self.migrate([
            ("api", "0005_move_rentals_reviews_to_own_apps"),
            ("rentals", "0002_enum_choices"),
        ])
        self.assertNotIn(("api", "rentalrecurrence"), state.models)
        self.seed_history(state, recurrence=False)
        self.assert_upgraded(recurrence=False)


class RentalPriceSnapshotMigrationTests(TransactionTestCase):
    """rentals.0003 freezes the agreed price of existing rentals (ADR 0002)."""

    def setUp(self):
        self.latest = MigrationExecutor(connection).loader.graph.leaf_nodes()
        self.addCleanup(lambda: MigrationExecutor(connection).migrate(self.latest))

    def test_backfill_uses_the_approved_payment_as_the_agreed_amount(self):
        state = MigrationExecutor(connection).migrate([("rentals", "0002_enum_choices")])
        apps = state.apps
        User = apps.get_model("users", "Users")
        owner, tenant = [User.objects.create(
            id=uuid.uuid4(), name=role, email=f"{role}@snapshot.test", document=f"snapshot-{role}",
            role=role, address="Test street", birth_date=date(1990, 1, 1),
        ) for role in ("locador", "locatario")]
        machine = apps.get_model("machines", "Machines").objects.create(id=uuid.uuid4(), owner_id=owner.pk)
        posting = apps.get_model("postings", "Postings").objects.create(
            id=uuid.uuid4(), machinery_id=machine.pk, hourly_rate="300.00", status="active",
        )
        Rental = apps.get_model("rentals", "Rentals")
        start = timezone.now() + timedelta(days=10)
        # The audit defect: repriced to R$5.040 while R$3.024 was actually paid.
        repriced, unpaid = [Rental.objects.create(
            id=uuid.uuid4(), postings_id=posting.pk, lessee_id=tenant.pk, start_date=start + timedelta(days=offset),
            end_date=start + timedelta(days=offset + 1), total_price=total, status=status,
            created_at=timezone.now(),
        ) for offset, total, status in ((0, "5040.00", "active"), (7, "2520.00", "pending"))]
        apps.get_model("payments", "Payments").objects.create(
            id=uuid.uuid4(), rental_id=repriced.pk, session_id="cs_snapshot", amount="3024.00", status="approved",
        )

        MigrationExecutor(connection).migrate(self.latest)
        from rentals.models import Rentals

        repriced = Rentals.objects.get(pk=repriced.pk)
        self.assertEqual(repriced.total_price, Decimal("3024.00"))
        self.assertEqual(repriced.subtotal, Decimal("2880.00"))
        self.assertEqual(repriced.platform_fee, Decimal("144.00"))
        self.assertEqual(repriced.daily_rate, Decimal("1440.00"))
        self.assertEqual(repriced.hourly_rate_snapshot, Decimal("180.00"))
        self.assertEqual(repriced.billable_days, 2)
        self.assertIsNotNone(repriced.priced_at)
        unpaid = Rentals.objects.get(pk=unpaid.pk)
        self.assertEqual(unpaid.total_price, Decimal("2520.00"))
        self.assertEqual(unpaid.hourly_rate_snapshot, Decimal("150.00"))
