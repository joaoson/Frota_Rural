import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.db import DataError, connection, transaction
from django.test import TestCase
from rest_framework.test import APIClient

from machines.models import Machines
from postings.models import Postings
from rentals.models import Rentals
from reviews.models import Reviews
from users.models import Users

BRT = ZoneInfo("America/Sao_Paulo")
NOW = datetime(2026, 3, 15, 15, 0, tzinfo=ZoneInfo("UTC"))
URL = "/api/dashboard/lessor"


def at(year, month, day, hour=10, minute=0):
    return datetime(year, month, day, hour, minute, tzinfo=BRT)


class LessorDashboardFixtures:
    def setUp(self):
        self.owner = self.user("owner", "locador")
        self.other_owner = self.user("other-owner", "locador")
        self.tenant = self.user("tenant", "locatario")
        self.m1 = self.machine(self.owner, "6110J")
        self.m2 = self.machine(self.owner, "6125J")
        self.m3 = self.machine(self.other_owner, "5090E")
        # 31/01 23:30 em Brasília já é 01/02 em UTC: o mês depende do fuso.
        self.r1 = self.rent(self.m1, "completed", at(2026, 1, 31, 23, 30), "100.00")
        self.r2 = self.rent(self.m2, "closed", at(2026, 3, 1), "250.00")
        self.r3 = self.rent(self.m1, "completed", at(2026, 3, 10), "300.00")
        self.rent(self.m1, "completed", at(2026, 3, 20), "999.00")  # término futuro
        self.rent(self.m2, "cancelled", at(2026, 3, 2), "500.00")
        self.rent(self.m1, "pending", at(2026, 4, 10), "400.00")
        self.rent(self.m2, "signed", at(2026, 3, 25), "600.00")
        self.rent(self.m1, "completed", at(2025, 12, 10), "700.00")  # antes de 3 meses
        r9 = self.rent(self.m3, "completed", at(2026, 3, 5), "800.00")
        self.review(self.r1, self.tenant, self.owner, 4, at(2026, 2, 10))
        self.review(self.r3, self.tenant, self.owner, 5, at(2026, 2, 20))
        self.review(self.r2, self.tenant, self.owner, 3, at(2026, 3, 2))
        self.review(self.r1, self.owner, self.tenant, 1, at(2026, 2, 11))  # dada pelo locador
        self.review(r9, self.tenant, self.other_owner, 2, at(2026, 3, 6))
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    @staticmethod
    def user(name, role):
        return Users.objects.create(
            name=name, document=name, email=f"{name}@dashboard.test", role=role,
            address="Test street", birth_date=date(1990, 1, 1),
        )

    @staticmethod
    def machine(owner, model):
        return Machines.objects.create(id=uuid.uuid4(), owner=owner, brand="John Deere", model=model, status="active")

    def rent(self, machine, status, end, price):
        posting = Postings.objects.create(id=uuid.uuid4(), machinery=machine, hourly_rate="100.00", status="active")
        return Rentals.objects.create(
            id=uuid.uuid4(), postings=posting, lessee=self.tenant, start_date=end - timedelta(days=1),
            end_date=end, total_price=price, status=status,
        )

    @staticmethod
    def review(rental, reviewer, reviewee, rating, created_at):
        return Reviews.objects.create(
            id=uuid.uuid4(), rental=rental, reviewer=reviewer, reviewee=reviewee, rating=rating, created_at=created_at,
        )

    def get(self, **params):
        with patch("rentals.dashboard.timezone.now", return_value=NOW):
            return self.client.get(URL, params)


class LessorDashboardFunctionTests(LessorDashboardFixtures, TestCase):
    def monthly(self, months=3, time_zone="America/Sao_Paulo", machine=None, owner=None):
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT month, revenue, completed_rentals, reviews, average_rating "
                "FROM lessor_dashboard_monthly(%s, %s, %s, %s, %s)",
                [(owner or self.owner).pk, months, time_zone, NOW, machine],
            )
            return cursor.fetchall()

    def test_groups_finished_rentals_and_reviews_by_local_month_with_empty_months(self):
        self.assertEqual(self.monthly(), [
            (date(2026, 1, 1), Decimal("100.00"), 1, 0, None),
            (date(2026, 2, 1), Decimal("0.00"), 0, 2, Decimal("4.50")),
            (date(2026, 3, 1), Decimal("550.00"), 2, 1, Decimal("3.00")),
        ])

    def test_time_zone_decides_the_month_of_a_late_night_completion(self):
        rows = self.monthly(time_zone="UTC")
        self.assertEqual([(row[0], row[1]) for row in rows], [
            (date(2026, 1, 1), Decimal("0.00")),
            (date(2026, 2, 1), Decimal("100.00")),
            (date(2026, 3, 1), Decimal("550.00")),
        ])

    def test_machine_filter_and_owner_isolation(self):
        self.assertEqual(self.monthly(machine=self.m2.pk)[-1], (date(2026, 3, 1), Decimal("250.00"), 1, 1, Decimal("3.00")))
        self.assertEqual(self.monthly(machine=self.m3.pk)[-1][1:3], (Decimal("0.00"), 0))
        self.assertEqual(self.monthly(owner=self.other_owner)[-1], (date(2026, 3, 1), Decimal("800.00"), 1, 1, Decimal("2.00")))

    def test_longer_period_reaches_older_completions(self):
        rows = self.monthly(months=6)
        self.assertEqual(rows[0][0], date(2025, 10, 1))
        self.assertEqual(rows[2][1:3], (Decimal("700.00"), 1))
        self.assertEqual(len(rows), 6)

    def test_rejects_a_period_outside_the_supported_range(self):
        for months in (0, 25, None):
            with self.subTest(months=months), self.assertRaises(DataError), transaction.atomic():
                self.monthly(months=months)


class LessorDashboardEndpointTests(LessorDashboardFixtures, TestCase):
    def test_owner_receives_monthly_series_status_breakdown_and_top_machines(self):
        response = self.get(months=3)
        self.assertEqual(response.status_code, 200, response.data)
        data = response.json()
        self.assertEqual(data["period"], {"months": 3, "start": "2026-01-01", "end": "2026-03-15",
                                          "time_zone": "America/Sao_Paulo"})
        self.assertIsNone(data["machine"])
        self.assertEqual(data["totals"], {
            "revenue": "650.00", "current_month_revenue": "550.00", "completed_rentals": 3,
            "reviews": 3, "average_rating": "4.00", "open_rentals": 2, "rentals": 8,
        })
        self.assertEqual([(m["month"], m["revenue"], m["average_rating"]) for m in data["monthly"]], [
            ("2026-01-01", "100.00", None), ("2026-02-01", "0.00", "4.50"), ("2026-03-01", "550.00", "3.00"),
        ])
        self.assertEqual({row["status"]: row["total"] for row in data["status_breakdown"]}, {
            "pending": 1, "awaiting_payment": 0, "active": 0, "signed": 1,
            "completed": 4, "closed": 1, "cancelled": 1,
        })
        self.assertEqual(data["status_breakdown"][0]["label"], "Pendente")
        self.assertEqual(data["top_machines"], [
            {"machine": str(self.m1.pk), "name": "John Deere 6110J", "completed_rentals": 2, "revenue": "400.00"},
            {"machine": str(self.m2.pk), "name": "John Deere 6125J", "completed_rentals": 1, "revenue": "250.00"},
        ])

    def test_machine_filter_restricts_every_indicator(self):
        data = self.get(months=3, machine=str(self.m2.pk)).json()
        self.assertEqual(data["machine"], str(self.m2.pk))
        self.assertEqual(data["totals"]["revenue"], "250.00")
        self.assertEqual(data["totals"]["open_rentals"], 1)
        self.assertEqual(data["totals"]["rentals"], 3)
        self.assertEqual(data["totals"]["average_rating"], "3.00")
        self.assertEqual([machine["machine"] for machine in data["top_machines"]], [str(self.m2.pk)])

    def test_defaults_to_six_months_and_reports_no_average_without_reviews(self):
        data = self.get().json()
        self.assertEqual(data["period"]["start"], "2025-10-01")
        self.assertEqual(data["totals"]["revenue"], "1350.00")
        Reviews.objects.all().delete()
        self.assertIsNone(self.get().json()["totals"]["average_rating"])

    def test_only_lessors_see_their_own_machines(self):
        self.assertEqual(self.get(machine=str(self.m3.pk)).status_code, 404)
        self.client.force_authenticate(self.tenant)
        self.assertEqual(self.get().status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.get().status_code, 401)

    def test_invalid_filters_are_rejected(self):
        for params in ({"months": 0}, {"months": 25}, {"months": "seis"},
                       {"time_zone": "Mars/Base"}, {"machine": "not-a-uuid"}):
            with self.subTest(params=params):
                response = self.get(**params)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(set(response.json()["errors"]), set(params))
