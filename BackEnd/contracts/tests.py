import uuid
from datetime import date, timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from contracts import signature_evidence
from contracts.models import ContractSignatureOtps
from contracts.services import ContractService
from machines.models import Machines
from postings.models import Postings
from payments.models import Payments
from rentals.models import Rentals
from users.models import Users


def make_user(role, seq, **extra):
    return Users.objects.create(
        id=uuid.uuid4(),
        name=f"{role.title()} {seq}",
        document=extra.pop("document", f"doc{seq:011d}"),
        email=f"{role}{seq}@teste.com",
        role=role,
        address="Rua Teste, 100 - Castro/PR",
        birth_date=date(1990, 1, 1),
        status="active",
        **extra,
    )


def auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


class ContractTestCase(TestCase):
    def setUp(self):
        self.owner = make_user("locador", 1, document="12345678000199")
        self.lessee = make_user("locatario", 2, document="12345678909")
        self.stranger = make_user("locatario", 3)
        machine = Machines.objects.create(
            id=uuid.uuid4(), owner=self.owner, brand="John Deere", model="6135J", year=2021
        )
        posting = Postings.objects.create(
            id=uuid.uuid4(), machinery=machine, hourly_rate="100.00", status="active"
        )
        start = timezone.now() + timedelta(days=5)
        self.rental = Rentals.objects.create(
            id=uuid.uuid4(),
            postings=posting,
            lessee=self.lessee,
            start_date=start,
            end_date=start + timedelta(days=2),
            total_price="2520.00",
            status="active",
            created_at=timezone.now(),
        )
        Payments.objects.create(rental=self.rental, session_id="cs_contract_test", status="approved", amount="2520.00")
        self.contract = ContractService.create_for_rental(self.rental)
        self.client.defaults.update(auth(self.lessee))

    def revision_id(self, as_user=None):
        """`revisao.id` do documento como a parte o lê antes de assinar."""
        response = self.client.get(f"/api/contracts/{self.contract.id}", **auth(as_user or self.lessee))
        revision = response.json().get("revisao") if response.status_code == 200 else None
        return revision["id"] if revision else None

    def sign(self, role, as_user=None, **body):
        signer = as_user or (self.owner if role == "locador" else self.lessee)
        body.setdefault("revision_id", self.revision_id(signer))
        return self.client.post(
            f"/api/contracts/{self.contract.id}/sign",
            {"role": role, "name": "Fulano de Tal", **body},
            content_type="application/json",
            **auth(signer),
        )


@override_settings(CONTRACT_SIGNATURE_REQUIRE_OTP=False)
class ContractSignatureTests(ContractTestCase):
    def test_first_signature_keeps_contract_pending_and_paid_rental_active(self):
        response = self.sign("locatario")

        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["status"], "pending_signatures")
        self.assertTrue(body["accepted_by_lessee"])
        self.assertFalse(body["accepted_by_lessor"])
        self.assertEqual(body["signature_evidence"]["role"], "locatario")
        self.assertFalse(body["signature_evidence"]["otp_verified"])
        self.rental.refresh_from_db()
        self.assertEqual(self.rental.status, "active")

    def test_both_signatures_sign_contract_and_rental(self):
        self.assertEqual(self.sign("locatario").status_code, 200)

        response = self.sign("locador")

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["status"], "signed")
        self.rental.refresh_from_db()
        self.assertEqual(self.rental.status, "signed")

    def test_same_party_cannot_sign_twice(self):
        self.sign("locatario")

        response = self.sign("locatario")

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "already_signed")

    def test_authenticated_user_must_be_the_expected_party(self):
        response = self.sign("locador", as_user=self.stranger)

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["code"], "not_found")
        self.contract.refresh_from_db()
        self.assertFalse(self.contract.accepted_by_lessor)

    def test_role_outside_the_enum_is_a_validation_error(self):
        response = self.sign("admin")

        self.assertEqual(response.status_code, 400)
        self.assertIn("role", response.json()["errors"])

    def test_document_accepts_rental_id_and_shows_signature(self):
        self.sign("locatario")

        response = self.client.get(f"/api/contracts/{self.rental.id}")

        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["locador"]["tipo_documento"], "CNPJ")
        self.assertEqual(body["locatario"]["documento"], "123.456.789-09")
        self.assertEqual(body["equipamento"]["ano"], 2021)
        self.assertEqual(body["assinatura"]["data_locador"], "—")
        self.assertNotEqual(body["assinatura"]["data_locatario"], "—")
        self.assertEqual(len(body["evidencia"]["assinaturas"]), 1)

    def test_evidence_chain_is_intact_after_both_signatures(self):
        self.sign("locatario")
        self.sign("locador")

        response = self.client.get(f"/api/contracts/{self.contract.id}/evidence")

        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertTrue(body["cadeia_integra"])
        self.assertEqual(body["inconsistencias"], [])
        self.assertEqual(len(body["assinaturas"]), 2)

    def test_unknown_contract_returns_standard_error_body(self):
        response = self.client.get(f"/api/contracts/{uuid.uuid4()}")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["message"], "Contrato não encontrado.")


@override_settings(CONTRACT_SIGNATURE_REQUIRE_OTP=True)
class ContractOtpTests(ContractTestCase):
    def request_otp(self, role="locatario", as_user=None, **patch_kwargs):
        user = as_user or (self.owner if role == "locador" else self.lessee)
        headers = auth(user)
        with patch("contracts.services.send_contract_signature_otp_email", **patch_kwargs) as send:
            response = self.client.post(
                f"/api/contracts/{self.contract.id}/otp",
                {"role": role, "revision_id": self.revision_id(user)},
                content_type="application/json",
                **headers,
            )
        return response, send

    def test_request_masks_email_and_stores_only_the_hash(self):
        response, send = self.request_otp()

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["sent_to"], "lo********@teste.com")
        code = send.call_args.kwargs["code"]
        otp = ContractSignatureOtps.objects.get()
        self.assertNotEqual(otp.code_hash, code)
        self.assertEqual(otp.code_hash, signature_evidence.hash_otp_code(code, self.contract.id))

    def test_sign_with_the_code_received_by_email(self):
        _, send = self.request_otp()

        response = self.sign("locatario", otp=send.call_args.kwargs["code"])

        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.json()["signature_evidence"]["otp_verified"])
        self.assertIsNotNone(ContractSignatureOtps.objects.get().consumed_at)

    def test_wrong_code_is_rejected_and_counts_as_an_attempt(self):
        _, send = self.request_otp()
        wrong = "111111" if send.call_args.kwargs["code"] != "111111" else "222222"

        response = self.sign("locatario", otp=wrong)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["message"], "Código inválido.")
        self.assertEqual(ContractSignatureOtps.objects.get().attempts, 1)
        self.contract.refresh_from_db()
        self.assertFalse(self.contract.accepted_by_lessee)

    def test_missing_code_is_rejected_when_required(self):
        response = self.sign("locatario")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["message"], "Informe o código enviado para o seu e-mail.")

    def test_email_failure_returns_502_and_discards_the_code(self):
        response, _ = self.request_otp(side_effect=RuntimeError("resend fora do ar"))

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["code"], "external_service_error")
        self.assertFalse(ContractSignatureOtps.objects.exists())

    def test_other_user_cannot_request_the_code_of_a_party(self):
        response, send = self.request_otp(role="locador", as_user=self.stranger)

        self.assertEqual(response.status_code, 404)
        send.assert_not_called()
