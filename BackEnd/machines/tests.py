import uuid
from datetime import date

from django.test import TestCase
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework.test import APIClient

from machines.models import Machines
from postings.models import Postings
from users.models import Users


def make_owner(seq=1):
    return Users.objects.create(
        id=uuid.uuid4(),
        name="Locador",
        document=f"doc{seq:011d}",
        email=f"locador{seq}@teste.com",
        role="locador",
        address="Rua Teste, 100",
        birth_date=date(1990, 1, 1),
        status="active",
    )


class MachineApiTests(TestCase):
    def setUp(self):
        self.owner = make_owner()
        self.client.defaults["HTTP_AUTHORIZATION"] = f"Bearer {AccessToken.for_user(self.owner)}"

    def payload(self, **overrides):
        return {
            "owner": str(self.owner.id),
            "renagro_number": " rn-123 ",
            "brand": "John Deere",
            "model": "6135J",
            "year": 2021,
            **overrides,
        }

    def post(self, body):
        return self.client.post("/api/machines", body, content_type="application/json")

    def test_create_normalizes_renagro_and_defaults_status(self):
        response = self.post(self.payload())

        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["renagro_number"], "RN-123")
        self.assertEqual(body["status"], "active")
        self.assertIsNotNone(Machines.objects.get(id=body["id"]).created_at)

    def test_duplicate_renagro_is_reported_on_the_field(self):
        self.assertEqual(self.post(self.payload()).status_code, 201)

        response = self.post(self.payload(renagro_number="RN-123"))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "validation_error")
        self.assertIn("renagro_number", response.json()["errors"])

    def test_status_outside_the_enum_is_rejected(self):
        response = self.post(self.payload(status="quebrada"))

        self.assertEqual(response.status_code, 400)
        self.assertIn("status", response.json()["errors"])

    def test_unknown_machine_returns_standard_error_body(self):
        response = self.client.get(f"/api/machines/{uuid.uuid4()}")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.json(),
            {"code": "not_found", "message": "Máquina não encontrada.", "errors": {}},
        )

    def test_invalid_filter_is_a_400_not_a_500(self):
        response = self.client.get("/api/machines?owner=abc")

        self.assertEqual(response.status_code, 400)
        self.assertIn("owner", response.json()["errors"])

    def test_list_filters_by_owner_and_brand_case_insensitive(self):
        other = make_owner(2)
        Machines.objects.create(id=uuid.uuid4(), owner=self.owner, brand="John Deere")
        Machines.objects.create(id=uuid.uuid4(), owner=self.owner, brand="Valtra")
        Machines.objects.create(id=uuid.uuid4(), owner=other, brand="John Deere")

        response = self.client.get(f"/api/machines?owner={self.owner.id}&brand=john deere")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)

    def test_patch_moves_machine_to_maintenance(self):
        created = self.post(self.payload()).json()

        response = self.client.patch(
            f"/api/machines/{created['id']}",
            {"status": "maintenance"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["status"], "maintenance")
        self.assertNotEqual(response.json()["updated_at"], created["updated_at"])

    def test_delete_with_dependent_posting_returns_409(self):
        machine = Machines.objects.create(id=uuid.uuid4(), owner=self.owner, renagro_number="RN-9")
        Postings.objects.create(id=uuid.uuid4(), machinery=machine, hourly_rate="100.00")

        response = self.client.delete(f"/api/machines/{machine.id}")

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "has_dependents")
        self.assertTrue(Machines.objects.filter(id=machine.id).exists())

    def test_delete_without_dependents(self):
        machine = Machines.objects.create(id=uuid.uuid4(), owner=self.owner)

        response = self.client.delete(f"/api/machines/{machine.id}")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Machines.objects.filter(id=machine.id).exists())



class MachineFormTests(TestCase):
    def setUp(self):
        self.owner = Users.objects.create(
            id=uuid.uuid4(), name="Locador", document="machine-form-test",
            email="machine-form@example.test", role="locador", status="active",
            address="Castro, PR", birth_date=date(1990, 1, 1),
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def payload(self, renagro=" br1234567890 "):
        return {
            "owner": str(self.owner.id), "renagro_number": renagro,
            "brand": "John Deere", "model": "6110J", "year": "2019",
            "power_cv": "110", "hour_meter": "0",
        }

    def test_multipart_create_preserves_numeric_fields_and_normalizes_renagro(self):
        response = self.client.post("/api/machines", self.payload(), format="multipart")
        self.assertEqual(response.status_code, 201, response.data)
        machine = Machines.objects.get(pk=response.data["id"])
        self.assertEqual(machine.renagro_number, "BR1234567890")
        self.assertEqual(machine.power_cv, 110)
        self.assertEqual(machine.hour_meter, 0)
        self.assertIsNotNone(machine.hour_meter_updated_at)

    def test_multipart_patch_normalizes_renagro(self):
        created = self.client.post("/api/machines", self.payload(), format="json")
        response = self.client.patch(
            f'/api/machines/{created.data["id"]}',
            {"renagro_number": " br0987654321 ", "hour_meter": "25"},
            format="multipart",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["renagro_number"], "BR0987654321")
        self.assertEqual(response.data["hour_meter"], 25)

    def test_duplicate_multipart_renagro_returns_validation_error(self):
        self.client.post("/api/machines", self.payload(), format="json")
        response = self.client.post("/api/machines", self.payload(), format="multipart")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("renagro_number", response.data["errors"])
        self.assertEqual(Machines.objects.count(), 1)
