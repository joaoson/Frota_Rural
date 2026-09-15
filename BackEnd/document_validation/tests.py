import shutil
import tempfile
import uuid
from datetime import date
from pathlib import Path
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from document_validation.models import Certification, OperatorLicense
from users.models import Users


def make_user(seq=1):
    return Users.objects.create(
        id=uuid.uuid4(),
        name="Operador",
        document=f"doc{seq:011d}",
        email=f"operador{seq}@teste.com",
        role="operador",
        address="Rua Teste, 100",
        birth_date=date(1990, 1, 1),
        status="active",
    )


class OperatorLicenseTests(TestCase):
    def setUp(self):
        self.user = make_user()

    def payload(self, **overrides):
        return {
            "user": str(self.user.id),
            "name": "Carlos Santos",
            "birth_date": "1988-11-05",
            "cpf": "123.456.789-09",
            "rg": "12.345.678-9",
            "mother_name": "Maria Santos",
            "nationality": "Brasileira",
            "birth_place": "Curitiba/PR",
            "cnh_number": "01234567890",
            "category": "B",
            "first_license_date": "2008-01-10",
            "issue_date": "2023-01-10",
            "expiration_date": "2033-01-10",
            "issuing_state": "PR",
            "issuing_authority": "DETRAN-PR",
            "situation": "active",
            **overrides,
        }

    def post(self, body):
        return self.client.post("/api/operator-licenses/", body, content_type="application/json")

    def review(self, license_id, body):
        return self.client.patch(
            f"/api/operator-licenses/{license_id}/review", body, content_type="application/json"
        )

    def test_create_always_starts_pending_even_if_client_says_approved(self):
        response = self.post(self.payload(validation_status="approved", review_note="ok"))

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["validation_status"], "pending")
        self.assertIsNone(response.json()["review_note"])

    def test_rejection_requires_a_note(self):
        license_id = self.post(self.payload()).json()["id"]

        response = self.review(license_id, {"validation_status": "rejected"})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["errors"], {"review_note": ["O motivo da rejeição é obrigatório."]}
        )

    def test_review_cannot_set_pending(self):
        license_id = self.post(self.payload()).json()["id"]

        response = self.review(license_id, {"validation_status": "pending"})

        self.assertEqual(response.status_code, 400)
        self.assertIn("validation_status", response.json()["errors"])

    def test_approval_then_edit_goes_back_to_pending(self):
        license_id = self.post(self.payload()).json()["id"]
        approved = self.review(license_id, {"validation_status": "approved", "review_note": "ok"})
        self.assertEqual(approved.json()["validation_status"], "approved")

        response = self.client.patch(
            f"/api/operator-licenses/{license_id}",
            {"situation": "expired"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["validation_status"], "pending")
        self.assertIsNone(response.json()["review_note"])

    def test_list_filters_by_validation_status(self):
        self.post(self.payload())
        OperatorLicense.objects.update(validation_status="approved")
        self.post(self.payload(cnh_number="99999999999"))

        response = self.client.get("/api/operator-licenses/?validation_status=pending")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["cnh_number"] for item in response.json()], ["99999999999"])

    def test_invalid_filter_is_a_400(self):
        response = self.client.get("/api/operator-licenses/?validation_status=talvez")

        self.assertEqual(response.status_code, 400)


class CertificationTests(TestCase):
    def test_create_and_reject_with_note(self):
        user = make_user()
        created = self.client.post(
            "/api/certifications/",
            {
                "user": str(user.id),
                "issuing_organization": "SENAR",
                "title": "NR-31",
                "issue_date": "2024-03-15",
                "description": "Segurança no trabalho rural.",
            },
            content_type="application/json",
        )
        self.assertEqual(created.status_code, 201, created.content)

        response = self.client.patch(
            f"/api/certifications/{created.json()['id']}/review",
            {"validation_status": "rejected", "review_note": "Certificado vencido."},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200, response.content)
        certification = Certification.objects.get()
        self.assertEqual(certification.validation_status, "rejected")
        self.assertEqual(certification.review_note, "Certificado vencido.")

    def test_unknown_certification_returns_standard_error_body(self):
        response = self.client.get(f"/api/certifications/{uuid.uuid4()}")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["message"], "Certificação não encontrada.")


class DocumentFileTests(TestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)

    def test_upload_saves_the_file_and_returns_its_url(self):
        with override_settings(MEDIA_ROOT=self.media_root):
            response = self.client.post(
                "/api/documents/upload/",
                {"file": SimpleUploadedFile("cnh.pdf", b"%PDF", content_type="application/pdf")},
            )

        self.assertEqual(response.status_code, 201, response.content)
        url = response.json()["url"]
        self.assertTrue(url.startswith("/media/documents/") and url.endswith(".pdf"))
        self.assertTrue((Path(self.media_root) / "documents" / Path(url).name).exists())

    def test_upload_rejects_unsupported_type(self):
        response = self.client.post(
            "/api/documents/upload/",
            {"file": SimpleUploadedFile("nota.txt", b"x", content_type="text/plain")},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["message"],
            "Tipo de arquivo não suportado. Envie JPG, PNG, WEBP ou PDF.",
        )

    def test_upload_without_file(self):
        response = self.client.post("/api/documents/upload/", {})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["message"], "Nenhum arquivo enviado.")

    def test_classification_result_is_returned(self):
        result = {"is_valid": True, "confidence": "high", "score": 0.97}
        with patch("document_validation.services.CnhClassifier.classify", return_value=result):
            response = self.client.post(
                "/api/operator-licenses/validate-document/",
                {"file": SimpleUploadedFile("cnh.jpg", b"x", content_type="image/jpeg")},
            )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json(), result)

    def test_missing_ml_environment_returns_503(self):
        with patch(
            "document_validation.services.CnhClassifier.classify",
            side_effect=FileNotFoundError("Modelo não encontrado."),
        ):
            response = self.client.post(
                "/api/operator-licenses/validate-document/",
                {"file": SimpleUploadedFile("cnh.jpg", b"x", content_type="image/jpeg")},
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.json(),
            {"code": "service_unavailable", "message": "Modelo não encontrado.", "errors": {}},
        )
