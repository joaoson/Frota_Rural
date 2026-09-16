import uuid
from datetime import date, timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from contracts.models import Contracts
from machines.models import Machines
from postings.models import Postings
from rentals.models import Rentals
from rentals.services import PERIOD_CONFLICT_MESSAGE, RentalService
from users.models import Users


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


class RentalApiTests(TestCase):
    def setUp(self):
        self.owner = make_user("locador", 1)
        self.lessee = make_user("locatario", 2)
        machine = Machines.objects.create(
            id=uuid.uuid4(), owner=self.owner, brand="John Deere", model="6135J"
        )
        self.posting = Postings.objects.create(
            id=uuid.uuid4(),
            machinery=machine,
            hourly_rate="100.00",
            status="active",
            max_reservation_days=10,
        )
        self.start = timezone.now().replace(microsecond=0) + timedelta(days=10)

    def payload(self, start_offset=0, days=3, **overrides):
        start = self.start + timedelta(days=start_offset)
        end = start + timedelta(days=days - 1)
        return {
            "postings": str(self.posting.id),
            "lessee": str(self.lessee.id),
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "total_price": "2400.00",
            **overrides,
        }

    def post(self, body):
        return self.client.post("/api/rentals", body, content_type="application/json")

    def test_create_also_creates_a_pending_contract(self):
        response = self.post(self.payload())

        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["status"], "pending")
        self.assertEqual(body["contract_status"], "pending_signatures")
        self.assertFalse(body["accepted_by_lessor"])
        self.assertFalse(body["accepted_by_lessee"])
        self.assertTrue(Contracts.objects.filter(rental_id=body["id"]).exists())

    def test_period_touching_the_cleaning_buffer_is_rejected(self):
        self.assertEqual(self.post(self.payload()).status_code, 201)

        # A primeira reserva ocupa os dias 0-2; o dia 3 é a limpeza.
        response = self.post(self.payload(start_offset=3))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json(),
            {
                "code": "validation_error",
                "message": PERIOD_CONFLICT_MESSAGE,
                "errors": {"non_field_errors": [PERIOD_CONFLICT_MESSAGE]},
            },
        )

    def test_period_after_the_buffer_is_accepted(self):
        self.assertEqual(self.post(self.payload()).status_code, 201)

        self.assertEqual(self.post(self.payload(start_offset=4)).status_code, 201)

    def test_cancelled_rental_does_not_block_the_period(self):
        first = self.post(self.payload()).json()
        Rentals.objects.filter(id=first["id"]).update(status="cancelled")

        self.assertEqual(self.post(self.payload()).status_code, 201)

    def test_longer_than_posting_limit_is_rejected(self):
        response = self.post(self.payload(days=11))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["errors"]["end_date"],
            ["Este anúncio permite reservas de no máximo 10 dias."],
        )

    def test_end_before_start_is_rejected(self):
        body = self.payload()
        body["start_date"], body["end_date"] = body["end_date"], body["start_date"]

        response = self.post(body)

        self.assertEqual(response.status_code, 400)
        self.assertIn("end_date", response.json()["errors"])

    def test_status_outside_the_enum_is_rejected(self):
        response = self.post(self.payload(status="bogus"))

        self.assertEqual(response.status_code, 400)
        self.assertIn("status", response.json()["errors"])

    def test_invalid_filter_is_a_400(self):
        response = self.client.get("/api/rentals?lessee=abc")

        self.assertEqual(response.status_code, 400)
        self.assertIn("lessee", response.json()["errors"])

    def test_list_filters_by_lessor(self):
        self.post(self.payload())
        other_owner = make_user("locador", 3)

        mine = self.client.get(f"/api/rentals?lessor={self.owner.id}").json()
        theirs = self.client.get(f"/api/rentals?lessor={other_owner.id}").json()

        self.assertEqual(len(mine), 1)
        self.assertEqual(theirs, [])

    def test_unknown_rental_returns_standard_error_body(self):
        response = self.client.get(f"/api/rentals/{uuid.uuid4()}")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["code"], "not_found")
        self.assertEqual(response.json()["message"], "Locação não encontrada.")

    def test_delete_with_contract_returns_409(self):
        rental_id = self.post(self.payload()).json()["id"]

        response = self.client.delete(f"/api/rentals/{rental_id}")

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "has_dependents")
        self.assertTrue(Rentals.objects.filter(id=rental_id).exists())


class RentalServiceTests(TestCase):
    def test_contract_failure_rolls_back_the_rental(self):
        owner = make_user("locador", 1)
        lessee = make_user("locatario", 2)
        machine = Machines.objects.create(id=uuid.uuid4(), owner=owner)
        posting = Postings.objects.create(id=uuid.uuid4(), machinery=machine, hourly_rate="100.00")
        start = timezone.now() + timedelta(days=5)

        with (
            patch(
                "rentals.services.ContractService.create_for_rental",
                side_effect=RuntimeError("falha simulada"),
            ),
            self.assertRaises(RuntimeError),
        ):
            RentalService.create(
                {
                    "postings": str(posting.id),
                    "lessee": str(lessee.id),
                    "start_date": start.isoformat(),
                    "end_date": (start + timedelta(days=1)).isoformat(),
                }
            )

        self.assertFalse(Rentals.objects.exists())
