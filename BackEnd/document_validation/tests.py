import json
import shutil
import subprocess
import tempfile
import uuid
from datetime import date
from pathlib import Path
from unittest import skipUnless
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, SimpleTestCase, TestCase, override_settings
from rest_framework_simplejwt.tokens import AccessToken

from document_validation.ml_adapters import cnh_data, cnh_image
from document_validation.ml_adapters.cnh_data import CnhDataChecker, DataCheckResult
from document_validation.ml_adapters.common import ML_DIR, ML_PYTHON
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


class LicenseApiMixin:
    """Helpers de chamada à API de CNH, compartilhados pelas classes de teste."""

    client: Client

    def setUp(self):
        self.user = make_user()
        self.admin = make_user(99)
        self.admin.role = "admin"
        self.admin.save(update_fields=["role"])
        self.client.defaults["HTTP_AUTHORIZATION"] = f"Bearer {AccessToken.for_user(self.user)}"

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
        return self.client.post("/api/operator-licenses", body, content_type="application/json")

    def review(self, license_id, body):
        return self.client.patch(
            f"/api/operator-licenses/{license_id}/review", body, content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.admin)}"
        )

    def edit(self, license_id, body):
        return self.client.patch(
            f"/api/operator-licenses/{license_id}", body, content_type="application/json"
        )


# O modelo de plausibilidade tem testes próprios (abaixo): aqui fica desligado para que
# estes testes não dependam do modelo treinado nem do interpretador do ML.
@override_settings(ML_PLAUSIBILITY_MODE="off")
class OperatorLicenseTests(LicenseApiMixin, TestCase):
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

        response = self.client.get("/api/operator-licenses?validation_status=pending")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["cnh_number"] for item in response.json()], ["99999999999"])

    def test_invalid_filter_is_a_400(self):
        response = self.client.get("/api/operator-licenses?validation_status=talvez")

        self.assertEqual(response.status_code, 400)


class CertificationTests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.admin = make_user(99)
        self.admin.role = "admin"
        self.admin.save(update_fields=["role"])
        self.client.defaults["HTTP_AUTHORIZATION"] = f"Bearer {AccessToken.for_user(self.user)}"

    def test_create_and_reject_with_note(self):
        user = self.user
        created = self.client.post(
            "/api/certifications",
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
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.admin)}",
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
        self.client.defaults["HTTP_AUTHORIZATION"] = f"Bearer {AccessToken.for_user(make_user())}"
        self.media_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)

    def test_upload_saves_the_file_and_returns_its_url(self):
        with override_settings(MEDIA_ROOT=self.media_root):
            response = self.client.post(
                "/api/documents/upload",
                {"file": SimpleUploadedFile("cnh.pdf", b"%PDF", content_type="application/pdf")},
            )

        self.assertEqual(response.status_code, 201, response.content)
        url = response.json()["url"]
        self.assertTrue(url.startswith("/media/documents/") and url.endswith(".pdf"))
        self.assertTrue((Path(self.media_root) / "documents" / Path(url).name).exists())

    def test_upload_rejects_unsupported_type(self):
        response = self.client.post(
            "/api/documents/upload",
            {"file": SimpleUploadedFile("nota.txt", b"x", content_type="text/plain")},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["message"],
            "Tipo de arquivo não suportado. Envie JPG, PNG, WEBP ou PDF.",
        )

    def test_upload_without_file(self):
        response = self.client.post("/api/documents/upload", {})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["message"], "Nenhum arquivo enviado.")

    def validate(self, result):
        with patch("document_validation.services.CnhClassifier.classify", return_value=result):
            return self.client.post(
                "/api/operator-licenses/validate-document",
                {"file": SimpleUploadedFile("cnh.jpg", b"x", content_type="image/jpeg")},
            )

    def test_classification_result_is_returned(self):
        result = {"is_valid": True, "confidence": "high", "score": 0.97}

        response = self.validate(result)

        self.assertEqual(response.status_code, 200, response.content)
        # Sem OCR (ou com um classificador antigo), os campos novos voltam vazios.
        self.assertEqual(response.json(), {**result, "fields": None})

    def test_ocr_fields_and_layout_are_returned_for_the_form_to_prefill(self):
        result = {
            "is_valid": True,
            "confidence": "medium",
            "score": 0.35,
            "document_type": "cnh_digital",
            "fields": {"cpf": "52998224725", "birth_place": "CURITIBA – PR", "ear": True},
            "uncertain_fields": ["name"],
        }

        response = self.validate(result)

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json(), result)

    def test_unknown_layout_has_no_fields(self):
        result = {
            "is_valid": True,
            "confidence": "high",
            "score": 0.9,
            "document_type": "desconhecido",
            "fields": None,
            "uncertain_fields": [],
        }

        self.assertEqual(self.validate(result).json(), result)

    def test_missing_ml_environment_returns_503(self):
        with patch(
            "document_validation.services.CnhClassifier.classify",
            side_effect=FileNotFoundError("Modelo não encontrado."),
        ):
            response = self.client.post(
                "/api/operator-licenses/validate-document",
                {"file": SimpleUploadedFile("cnh.jpg", b"x", content_type="image/jpeg")},
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.json(),
            {"code": "service_unavailable", "message": "Modelo não encontrado.", "errors": {}},
        )


SUSPICIOUS = DataCheckResult(
    is_suspicious=True,
    score=1.0,
    reasons=["CPF inválido"],
    fields=["nome", "datas"],
)
FINE = DataCheckResult()
CHECK = "document_validation.services.CnhDataChecker.check"
EXPECTED_NOTE = (
    "Os dados informados parecem inconsistentes ou falsos (nome, datas). "
    "Corrija e reenvie, ou aguarde a análise manual."
)


@override_settings(ML_PLAUSIBILITY_MODE="enforce")
class OperatorLicenseScreeningTests(LicenseApiMixin, TestCase):
    """Recusa automática pelo modelo de plausibilidade (o checker é simulado)."""

    def test_suspicious_data_is_saved_but_rejected_with_the_reason(self):
        with patch(CHECK, return_value=SUSPICIOUS):
            response = self.post(self.payload())

        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["validation_status"], "rejected")
        self.assertEqual(body["review_note"], EXPECTED_NOTE)
        self.assertTrue(body["auto_rejected"])
        self.assertTrue(OperatorLicense.objects.filter(id=body["id"]).exists())

    def test_plausible_data_stays_pending(self):
        with patch(CHECK, return_value=FINE):
            body = self.post(self.payload()).json()

        self.assertEqual(body["validation_status"], "pending")
        self.assertIsNone(body["review_note"])
        self.assertFalse(body["auto_rejected"])

    def test_checker_failure_never_rejects(self):
        with patch(CHECK, return_value=DataCheckResult(error="modelo indisponível")):
            body = self.post(self.payload()).json()

        self.assertEqual(body["validation_status"], "pending")

    def test_the_checker_receives_the_license_fields_but_no_internal_state(self):
        with patch(CHECK, return_value=FINE) as check:
            self.post(self.payload(name="Carlos Santos"))

        record = check.call_args.args[0]
        self.assertEqual(record["name"], "Carlos Santos")
        self.assertEqual(record["birth_date"], date(1988, 11, 5))
        self.assertEqual(record["birth_place"], "Curitiba/PR")
        for internal in ("id", "user", "validation_status", "review_note", "file_url"):
            self.assertNotIn(internal, record)

    def test_edit_is_screened_again_and_can_leave_the_rejection(self):
        with patch(CHECK, return_value=SUSPICIOUS):
            license_id = self.post(self.payload()).json()["id"]

        with patch(CHECK, return_value=FINE):
            fixed = self.edit(license_id, {"name": "Carlos Eduardo Santos"})

        self.assertEqual(fixed.status_code, 200, fixed.content)
        self.assertEqual(fixed.json()["validation_status"], "pending")
        self.assertIsNone(fixed.json()["review_note"])
        self.assertFalse(fixed.json()["auto_rejected"])

    def test_edit_that_is_still_suspicious_is_rejected_again(self):
        with patch(CHECK, return_value=FINE):
            license_id = self.post(self.payload()).json()["id"]

        with patch(CHECK, return_value=SUSPICIOUS):
            edited = self.edit(license_id, {"name": "asdf"})

        self.assertEqual(edited.json()["validation_status"], "rejected")
        self.assertEqual(edited.json()["review_note"], EXPECTED_NOTE)

    def test_admin_decision_replaces_the_automatic_rejection(self):
        with patch(CHECK, return_value=SUSPICIOUS):
            license_id = self.post(self.payload()).json()["id"]

        approved = self.review(license_id, {"validation_status": "approved", "review_note": "ok"})

        self.assertEqual(approved.json()["validation_status"], "approved")
        self.assertFalse(approved.json()["auto_rejected"])

    def test_admin_rejection_is_not_marked_as_automatic(self):
        with patch(CHECK, return_value=FINE):
            license_id = self.post(self.payload()).json()["id"]

        rejected = self.review(license_id, {"validation_status": "rejected", "review_note": "x"})

        self.assertEqual(rejected.json()["validation_status"], "rejected")
        self.assertFalse(rejected.json()["auto_rejected"])

    @override_settings(ML_PLAUSIBILITY_MODE="shadow")
    def test_shadow_mode_only_logs(self):
        with (
            patch(CHECK, return_value=SUSPICIOUS),
            self.assertLogs("document_validation.services", level="INFO") as logs,
        ):
            body = self.post(self.payload()).json()

        self.assertEqual(body["validation_status"], "pending")
        self.assertFalse(body["auto_rejected"])
        self.assertIn("considerada suspeita", logs.output[0])
        self.assertIn("CPF inválido", logs.output[0])  # os motivos das regras vão para o log
        self.assertNotIn("Carlos", logs.output[0])  # sem dados pessoais no log

    @override_settings(ML_PLAUSIBILITY_MODE="off")
    def test_off_mode_does_not_call_the_model(self):
        with patch(CHECK, return_value=SUSPICIOUS) as check:
            body = self.post(self.payload()).json()

        check.assert_not_called()
        self.assertEqual(body["validation_status"], "pending")


READ = "document_validation.services.CnhClassifier.classify_path"
OCR_READING = {
    "is_valid": True,
    "confidence": "high",
    "score": 0.99,
    "document_type": "cnh_antiga",
    "fields": {"cpf": "52998224725", "birth_date": "1988-11-05"},
    "uncertain_fields": ["name"],
}
MISMATCH = DataCheckResult(
    is_suspicious=True,
    score=0.97,
    fields=["números dos documentos"],
    veracity=3,
    basis="ocr+plausibility",
    mismatch_fields=["números dos documentos"],
)


@override_settings(ML_PLAUSIBILITY_MODE="enforce")
class OperatorLicenseVeracityTests(LicenseApiMixin, TestCase):
    """Índice de veracidade: o OCR do arquivo salvo entra na avaliação (checker e OCR simulados)."""

    def setUp(self):
        super().setUp()
        self.media_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)
        documents = Path(self.media_root, "documents")
        documents.mkdir()
        (documents / "cnh.jpg").write_bytes(b"x")
        self.settings_override = override_settings(MEDIA_ROOT=self.media_root)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)

    def post_with_file(self, file_url="/media/documents/cnh.jpg", **overrides):
        return self.post(self.payload(file_url=file_url, **overrides))

    def test_the_ocr_of_the_stored_file_is_given_to_the_checker(self):
        with (
            patch(READ, return_value=OCR_READING) as read,
            patch(CHECK, return_value=FINE) as check,
        ):
            self.post_with_file()

        self.assertEqual(read.call_args.args[0], Path(self.media_root, "documents", "cnh.jpg"))
        self.assertEqual(
            check.call_args.args[1],
            {"fields": OCR_READING["fields"], "uncertain_fields": ["name"]},
        )

    def test_a_full_url_for_the_stored_file_is_accepted(self):
        with patch(READ, return_value=OCR_READING) as read, patch(CHECK, return_value=FINE):
            self.post_with_file("http://localhost:8000/media/documents/cnh.jpg")

        read.assert_called_once()

    def test_the_veracity_is_stored_and_returned(self):
        with (
            patch(READ, return_value=OCR_READING),
            patch(CHECK, return_value=DataCheckResult(veracity=88)),
        ):
            body = self.post_with_file().json()

        self.assertEqual(body["veracity_score"], 88)
        self.assertEqual(OperatorLicense.objects.get(id=body["id"]).veracity_score, 88)
        self.assertEqual(body["validation_status"], "pending")

    def test_a_photo_mismatch_rejects_with_the_dedicated_note(self):
        with patch(READ, return_value=OCR_READING), patch(CHECK, return_value=MISMATCH):
            body = self.post_with_file().json()

        self.assertEqual(body["validation_status"], "rejected")
        self.assertTrue(body["auto_rejected"])
        self.assertEqual(body["veracity_score"], 3)
        self.assertIn("não conferem com o documento enviado", body["review_note"])
        self.assertIn("números dos documentos", body["review_note"])
        self.assertNotIn("0.97", body["review_note"])

    def test_without_a_file_there_is_no_ocr_and_the_checker_falls_back(self):
        with patch(READ) as read, patch(CHECK, return_value=FINE) as check:
            self.post(self.payload())

        read.assert_not_called()
        self.assertIsNone(check.call_args.args[1])

    def test_unreadable_documents_fall_back_to_plausibility(self):
        cases = {
            "erro do classificador": {"is_valid": False, "error": "falhou"},
            "layout não reconhecido": {
                **OCR_READING,
                "document_type": "desconhecido",
                "fields": None,
            },
            "sem campos": {**OCR_READING, "fields": {}},
        }
        for name, reading in cases.items():
            with (
                self.subTest(name),
                patch(READ, return_value=reading),
                patch(CHECK, return_value=FINE) as check,
            ):
                self.post_with_file(cnh_number=f"{len(name):011d}")
                self.assertIsNone(check.call_args.args[1])

    def test_an_ocr_crash_never_breaks_the_save(self):
        with (
            patch(READ, side_effect=FileNotFoundError("sem venv")),
            patch(CHECK, return_value=FINE) as check,
            self.assertLogs("document_validation.services", level="WARNING") as logs,
        ):
            response = self.post_with_file()

        self.assertEqual(response.status_code, 201)
        self.assertIsNone(check.call_args.args[1])
        self.assertNotIn("sem venv", logs.output[0])

    def test_file_urls_outside_the_documents_folder_are_never_read(self):
        Path(self.media_root, "secret.jpg").write_bytes(b"x")
        urls = [
            "/media/documents/../secret.jpg",
            "/media/secret.jpg",
            "/etc/passwd",
            "/media/documents/missing.jpg",
            "/media/documents/",
            "https://evil.example/other.jpg",
        ]
        for url in urls:
            with self.subTest(url=url), patch(READ) as read, patch(CHECK, return_value=FINE):
                self.post_with_file(url, cnh_number=f"{len(url):011d}")
                read.assert_not_called()

    def test_editing_recomputes_the_veracity(self):
        with (
            patch(READ, return_value=OCR_READING),
            patch(CHECK, return_value=DataCheckResult(veracity=90)),
        ):
            license_id = self.post_with_file().json()["id"]

        with (
            patch(READ, return_value=OCR_READING),
            patch(CHECK, return_value=DataCheckResult(veracity=40)),
        ):
            edited = self.edit(license_id, {"name": "Carlos Eduardo Santos"})

        self.assertEqual(edited.json()["veracity_score"], 40)

    def test_editing_with_the_model_unavailable_clears_the_stale_index(self):
        with patch(CHECK, return_value=DataCheckResult(veracity=90)):
            license_id = self.post(self.payload()).json()["id"]

        with patch(CHECK, return_value=DataCheckResult(error="modelo indisponível")):
            edited = self.edit(license_id, {"name": "Carlos Eduardo Santos"})

        self.assertIsNone(edited.json()["veracity_score"])

    @override_settings(ML_PLAUSIBILITY_MODE="shadow")
    def test_shadow_mode_stores_the_index_but_does_not_reject(self):
        with patch(READ, return_value=OCR_READING), patch(CHECK, return_value=MISMATCH):
            body = self.post_with_file().json()

        self.assertEqual(body["validation_status"], "pending")
        self.assertEqual(body["veracity_score"], 3)

    @override_settings(ML_PLAUSIBILITY_MODE="off")
    def test_off_mode_runs_neither_the_ocr_nor_the_model(self):
        with patch(READ) as read, patch(CHECK) as check:
            body = self.post_with_file().json()

        read.assert_not_called()
        check.assert_not_called()
        self.assertIsNone(body["veracity_score"])


class CnhDataCheckerTests(SimpleTestCase):
    """Adaptador do modelo de dados: o subprocess é simulado."""

    RECORD = {"name": "Carlos Santos", "cpf": "52998224725", "issue_date": date(2023, 1, 10)}

    def run_check(self, completed=None, **run_kwargs):
        # MagicMock em ML_PYTHON/MODEL_PATH: `.exists()` é verdadeiro sem tocar no disco.
        with (
            patch.object(cnh_data, "ML_PYTHON"),
            patch.object(cnh_data, "MODEL_PATH"),
            patch("document_validation.ml_adapters.cnh_data.subprocess.run", **run_kwargs) as run,
        ):
            if completed is not None:
                run.return_value = completed
            return CnhDataChecker.check(self.RECORD), run

    @staticmethod
    def completed(stdout="", returncode=0):
        return subprocess.CompletedProcess([], returncode, stdout=stdout, stderr="")

    def test_parses_the_model_output(self):
        output = '{"is_suspicious": true, "score": 1.0, "reasons": ["a"], "fields": ["nome"]}'

        result, _ = self.run_check(self.completed(output))

        self.assertTrue(result.is_suspicious)
        self.assertEqual(result.score, 1.0)
        self.assertEqual((result.reasons, result.fields), (["a"], ["nome"]))
        self.assertIsNone(result.error)

    def test_parses_the_veracity_fields(self):
        output = (
            '{"is_suspicious": true, "score": 0.97, "reasons": [], "fields": ["datas"], '
            '"veracity": 3, "basis": "ocr+plausibility", "mismatch_fields": ["datas"]}'
        )

        result, _ = self.run_check(self.completed(output))

        self.assertEqual((result.veracity, result.basis), (3, "ocr+plausibility"))
        self.assertEqual(result.mismatch_fields, ["datas"])

    def test_ocr_goes_through_stdin_next_to_the_record(self):
        ocr = {"fields": {"cpf": "52998224725"}, "uncertain_fields": ["name"]}

        with (
            patch.object(cnh_data, "ML_PYTHON"),
            patch.object(cnh_data, "MODEL_PATH"),
            patch("document_validation.ml_adapters.cnh_data.subprocess.run") as run,
        ):
            run.return_value = self.completed('{"is_suspicious": false}')
            CnhDataChecker.check(self.RECORD, ocr)

        payload = json.loads(run.call_args.kwargs["input"])
        self.assertEqual(payload["ocr"], ocr)
        self.assertEqual(payload["record"]["name"], "Carlos Santos")

    def test_without_ocr_the_envelope_carries_null(self):
        _, run = self.run_check(self.completed('{"is_suspicious": false}'))

        self.assertIsNone(json.loads(run.call_args.kwargs["input"])["ocr"])

    def test_record_goes_through_stdin_not_argv(self):
        _, run = self.run_check(self.completed('{"is_suspicious": false}'))

        args, kwargs = run.call_args
        self.assertNotIn("52998224725", " ".join(args[0]))
        self.assertIn('"cpf": "52998224725"', kwargs["input"])
        self.assertIn('"issue_date": "2023-01-10"', kwargs["input"])  # date vira ISO
        self.assertEqual(kwargs["timeout"], cnh_data.CHECK_TIMEOUT_SECONDS)

    def test_technical_failures_fail_open(self):
        cases = {
            "processo com erro": self.completed("", returncode=1),
            "saída inválida": self.completed("não é json"),
            "erro do modelo": self.completed('{"is_suspicious": false, "error": "sem modelo"}'),
        }
        for name, completed in cases.items():
            with self.subTest(name), self.assertLogs("document_validation.ml_adapters.cnh_data"):
                result, _ = self.run_check(completed)
                self.assertFalse(result.is_suspicious)
                self.assertIsNotNone(result.error)

    def test_timeout_fails_open(self):
        timeout = subprocess.TimeoutExpired(cmd="x", timeout=10)

        with self.assertLogs("document_validation.ml_adapters.cnh_data"):
            result, _ = self.run_check(side_effect=timeout)

        self.assertFalse(result.is_suspicious)
        self.assertEqual(result.error, "tempo limite excedido")

    def test_missing_model_fails_open_without_running_anything(self):
        with (
            patch.object(cnh_data, "ML_PYTHON"),
            patch.object(cnh_data, "MODEL_PATH") as model,
            patch("document_validation.ml_adapters.cnh_data.subprocess.run") as run,
            self.assertLogs("document_validation.ml_adapters.cnh_data"),
        ):
            model.exists.return_value = False
            result = CnhDataChecker.check(self.RECORD)

        run.assert_not_called()
        self.assertFalse(result.is_suspicious)

    def test_review_note_cites_fields_but_not_rules(self):
        with_fields = DataCheckResult(
            is_suspicious=True, reasons=["CPF inválido"], fields=["nome", "datas"]
        )
        without_fields = DataCheckResult(is_suspicious=True)

        self.assertEqual(with_fields.review_note, EXPECTED_NOTE)
        self.assertNotIn("CPF", with_fields.review_note)
        self.assertEqual(
            without_fields.review_note,
            "Os dados informados parecem inconsistentes ou falsos. "
            "Corrija e reenvie, ou aguarde a análise manual.",
        )

    def test_review_note_for_a_photo_mismatch_names_the_fields_only(self):
        result = DataCheckResult(
            is_suspicious=True, fields=["datas"], mismatch_fields=["números dos documentos"]
        )

        self.assertEqual(
            result.review_note,
            "Os dados informados não conferem com o documento enviado (números dos documentos). "
            "Corrija e reenvie, ou aguarde a análise manual.",
        )


@skipUnless(
    ML_PYTHON.exists() and cnh_data.MODEL_PATH.exists(),
    "venv de ML ou modelo treinado ausentes (ver ml/README.md)",
)
@override_settings(ML_PLAUSIBILITY_MODE="enforce")
class OperatorLicenseEndToEndTests(LicenseApiMixin, TestCase):
    """Sem simulação: API → service → subprocess → modelo treinado de verdade."""

    def realistic(self, **overrides):
        fields = {
            "name": "Carlos Eduardo Santos",
            "cpf": "529.982.247-25",
            "rg": "29.384.756-1",
            "mother_name": "Maria Aparecida Santos",
            "father_name": "Antônio Carlos Santos",
            "nationality": "Brasileiro(a)",
            "birth_place": "Curitiba – PR",
            "cnh_number": "48213907563",
            **overrides,
        }
        return self.payload(**fields)

    def test_realistic_data_is_left_for_the_admin(self):
        body = self.post(self.realistic()).json()

        self.assertEqual(body["validation_status"], "pending")
        self.assertFalse(body["auto_rejected"])

    def test_junk_data_is_saved_as_rejected_with_the_reason(self):
        response = self.post(
            self.realistic(name="Asdfghjkl", mother_name="Teste", cnh_number="11111111111")
        )

        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["validation_status"], "rejected")
        self.assertTrue(body["auto_rejected"])
        self.assertIn("parecem inconsistentes ou falsos", body["review_note"])
        self.assertIn("nome", body["review_note"])
        self.assertTrue(OperatorLicense.objects.filter(id=body["id"]).exists())

    def test_fixing_the_data_leaves_the_rejection(self):
        license_id = self.post(self.realistic(name="Asdfghjkl")).json()["id"]
        self.assertEqual(OperatorLicense.objects.get(id=license_id).validation_status, "rejected")

        fixed = self.edit(license_id, {"name": "Carlos Eduardo Santos"}).json()

        self.assertEqual(fixed["validation_status"], "pending")
        self.assertIsNone(fixed["review_note"])


_DATA = ML_DIR / "data"
_PHOTOS = sorted((_DATA / "cnh").glob("*_in.jpg"))[:1]
_DIGITAL_PDF = _DATA / "cnh_digital" / "CNH-e.pdf"


@skipUnless(
    ML_PYTHON.exists() and cnh_image.MODEL_PATH.exists() and (_PHOTOS or _DIGITAL_PDF.exists()),
    "venv de ML, modelo de imagem ou arquivos de exemplo ausentes (ver ml/README.md)",
)
class CnhOcrEndToEndTests(TestCase):
    """Sem simulação: API → adaptador → subprocess → rede neural + OCR → serializer.

    Só afirma estrutura (layout, chaves, CPF válido), nunca valores: o PDF digital é um
    documento pessoal real.
    """

    def post(self, path: Path, content_type: str):
        upload = SimpleUploadedFile(path.name, path.read_bytes(), content_type=content_type)
        return self.client.post("/api/operator-licenses/validate-document", {"file": upload})

    @skipUnless(_PHOTOS, "dataset BID ausente")
    def test_old_cnh_photo_returns_fields_for_the_form(self):
        response = self.post(_PHOTOS[0], "image/jpeg")

        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertTrue(body["is_valid"])
        self.assertEqual(body["document_type"], "cnh_antiga")
        self.assertEqual(len(body["fields"]["cpf"]), 11)
        self.assertEqual(len(body["fields"]["cnh_number"]), 11)
        self.assertTrue(set(body["uncertain_fields"]) <= set(body["fields"]))

    @skipUnless(_DIGITAL_PDF.exists(), "CNH digital ausente")
    def test_digital_cnh_is_promoted_by_the_ocr_even_if_the_network_rejects_it(self):
        response = self.post(_DIGITAL_PDF, "application/pdf")

        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertTrue(body["is_valid"])
        self.assertEqual(body["document_type"], "cnh_digital")
        self.assertLess(body["score"], 0.5)  # a rede só conhece a CNH antiga
        self.assertEqual(body["confidence"], "medium")
        self.assertIn("birth_place", body["fields"])  # a digital traz a naturalidade


@skipUnless(
    ML_PYTHON.exists()
    and cnh_image.MODEL_PATH.exists()
    and cnh_data.MODEL_PATH.exists()
    and _PHOTOS,
    "venv de ML, modelos ou dataset BID ausentes (ver ml/README.md)",
)
@override_settings(ML_PLAUSIBILITY_MODE="enforce")
class OperatorLicensePhotoConsistencyEndToEndTests(LicenseApiMixin, TestCase):
    """Sem simulação: foto salva → OCR → `cnh_data` → CNH recusada ou não.

    Os documentos do dataset BID são fictícios, e as datas deles são aleatórias (as regras
    de datas disparariam), então aqui só se afirma o que a foto muda: o motivo da recusa.
    """

    def setUp(self):
        super().setUp()
        self.media_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)
        settings_override = override_settings(MEDIA_ROOT=self.media_root)
        settings_override.enable()
        self.addCleanup(settings_override.disable)

    def upload_and_read(self):
        """Sobe uma foto do BID e devolve (file_url, campos lidos pelo OCR)."""
        photo = _PHOTOS[0]
        content = SimpleUploadedFile(photo.name, photo.read_bytes(), content_type="image/jpeg")
        read = self.client.post("/api/operator-licenses/validate-document", {"file": content})
        fields = read.json()["fields"] or {}
        content = SimpleUploadedFile(photo.name, photo.read_bytes(), content_type="image/jpeg")
        url = self.client.post("/api/documents/upload", {"file": content}).json()["url"]
        return url, fields

    def form_from(self, fields, **overrides):
        keys = (
            "cpf", "cnh_number", "birth_date", "issue_date", "expiration_date",
            "first_license_date", "issuing_state",
        )  # fmt: skip
        return {**{key: fields[key] for key in keys if key in fields}, **overrides}

    def test_data_that_match_the_photo_are_not_refused_for_inconsistency(self):
        url, fields = self.upload_and_read()
        self.assertIn("cpf", fields, "o OCR deveria ler o CPF da primeira foto do dataset")

        body = self.post(self.payload(file_url=url, **self.form_from(fields))).json()

        self.assertNotIn("não conferem", body["review_note"] or "")
        self.assertIsInstance(body["veracity_score"], int)

    def test_a_cpf_that_contradicts_the_photo_is_refused_with_the_dedicated_note(self):
        url, fields = self.upload_and_read()
        other_cpf = "52998224725" if fields["cpf"] != "52998224725" else "11144477735"

        body = self.post(self.payload(file_url=url, **self.form_from(fields, cpf=other_cpf))).json()

        self.assertEqual(body["validation_status"], "rejected")
        self.assertTrue(body["auto_rejected"])
        self.assertIn("não conferem com o documento enviado", body["review_note"])
        self.assertLessEqual(body["veracity_score"], 5)
