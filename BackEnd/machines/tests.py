import uuid
from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from users.models import Users

from .models import Machines


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
        response = self.client.post("/api/machines/", self.payload(), format="multipart")
        self.assertEqual(response.status_code, 201, response.data)
        machine = Machines.objects.get(pk=response.data["id"])
        self.assertEqual(machine.renagro_number, "BR1234567890")
        self.assertEqual(machine.power_cv, 110)
        self.assertEqual(machine.hour_meter, 0)
        self.assertIsNotNone(machine.hour_meter_updated_at)

    def test_multipart_patch_normalizes_renagro(self):
        created = self.client.post("/api/machines/", self.payload(), format="json")
        response = self.client.patch(
            f'/api/machines/{created.data["id"]}',
            {"renagro_number": " br0987654321 ", "hour_meter": "25"},
            format="multipart",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["renagro_number"], "BR0987654321")
        self.assertEqual(response.data["hour_meter"], 25)

    def test_duplicate_multipart_renagro_returns_validation_error(self):
        self.client.post("/api/machines/", self.payload(), format="json")
        response = self.client.post("/api/machines/", self.payload(), format="multipart")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("renagro_number", response.data)
        self.assertEqual(Machines.objects.count(), 1)
