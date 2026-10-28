"""OTP and IP evidence must describe what actually happened (plan step 1.3)."""

from unittest.mock import patch

from django.test import RequestFactory, SimpleTestCase, override_settings

from contracts import signature_evidence
from contracts.models import Contracts, ContractSignatureOtps, ContractSignatures
from contracts.revisions import freeze_revision
from contracts.tests import ContractTestCase, auth
from payments.models import Payments
from rentals.models import Rentals
from users.models import Users


@override_settings(CONTRACT_SIGNATURE_REQUIRE_OTP=True)
class SignatureOtpIdentityTests(ContractTestCase):
    def request_otp(self, role="locatario", **body):
        user = self.owner if role == "locador" else self.lessee
        body.setdefault("revision_id", self.revision_id(user))
        with patch("contracts.services.send_contract_signature_otp_email") as send:
            response = self.client.post(f"/api/contracts/{self.contract.id}/otp", {"role": role, **body},
                                        content_type="application/json", **auth(user))
        return response, (send.call_args.kwargs if send.called else None)

    def test_code_sent_to_the_old_address_cannot_verify_a_new_email(self):
        # Audit reproduction: request at the old address, change the profile email, sign with the old code.
        response, sent = self.request_otp()
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(sent["to_email"], "locatario2@teste.com")
        Users.objects.filter(pk=self.lessee.pk).update(email="new-unverified@example.test")
        self.lessee.refresh_from_db()

        response = self.sign("locatario", otp=sent["code"])
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn("e-mail mudou", response.json()["message"])
        self.assertFalse(ContractSignatures.objects.exists())
        self.assertIsNone(ContractSignatureOtps.objects.get().consumed_at)

        response, sent = self.request_otp()
        self.assertEqual(sent["to_email"], "new-unverified@example.test")
        response = self.sign("locatario", otp=sent["code"])
        self.assertEqual(response.status_code, 200, response.content)
        evidence = response.json()["signature_evidence"]
        self.assertTrue(evidence["otp_verified"])
        self.assertEqual(evidence["signer_email"], "new-unverified@example.test")

    def test_code_is_bound_to_the_signer_and_the_revision_it_was_issued_for(self):
        response, sent = self.request_otp()
        otp = ContractSignatureOtps.objects.get()
        self.contract.refresh_from_db()
        self.assertEqual(otp.signer, self.lessee)
        self.assertEqual(otp.revision_id, self.contract.current_revision_id)

        freeze_revision(Contracts.objects.get(pk=self.contract.pk), reason="amendment")
        response = self.sign("locatario", otp=sent["code"])
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn("outra versão", response.json()["message"])
        self.assertFalse(ContractSignatures.objects.exists())

    def test_code_requests_need_the_current_revision_a_paid_contract_and_an_unsigned_role(self):
        response, sent = self.request_otp(revision_id=None)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "stale_revision")
        self.assertIsNone(sent)

        _, sent = self.request_otp()
        self.assertEqual(self.sign("locatario", otp=sent["code"]).status_code, 200)
        response, sent = self.request_otp()
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "already_signed")
        self.assertIsNone(sent)

        Rentals.objects.filter(pk=self.rental.pk).update(status="pending")
        Payments.objects.all().delete()
        response, sent = self.request_otp(role="locador", revision_id=None)
        self.assertEqual(response.status_code, 409)
        self.assertIsNone(sent)


@override_settings(CONTRACT_SIGNATURE_REQUIRE_OTP=False)
class SignatureIpEvidenceTests(ContractTestCase):
    def test_direct_request_cannot_choose_its_recorded_ip(self):
        response = self.client.post(
            f"/api/contracts/{self.contract.id}/sign",
            {"role": "locatario", "name": "Fulano", "revision_id": self.revision_id()},
            content_type="application/json", HTTP_X_FORWARDED_FOR="203.0.113.77",
            REMOTE_ADDR="198.51.100.7", **auth(self.lessee),
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["signature_evidence"]["ip_address"], "198.51.100.7")


class ClientIpTests(SimpleTestCase):
    def ip(self, remote, forwarded=None):
        extra = {"HTTP_X_FORWARDED_FOR": forwarded} if forwarded is not None else {}
        return signature_evidence.client_ip(RequestFactory().get("/", REMOTE_ADDR=remote, **extra))

    @override_settings(CONTRACT_TRUSTED_PROXIES=[])
    def test_without_trusted_proxies_the_socket_peer_is_recorded(self):
        self.assertEqual(self.ip("198.51.100.7", "203.0.113.77"), "198.51.100.7")

    @override_settings(CONTRACT_TRUSTED_PROXIES=["10.0.0.0/8", "not-a-network"])
    def test_trusted_proxy_chain_records_the_nearest_untrusted_client(self):
        # The client forged the first entry; the proxy appended the real peer.
        self.assertEqual(self.ip("10.0.0.5", "203.0.113.77, 198.51.100.20"), "198.51.100.20")
        self.assertEqual(self.ip("10.0.0.5", "198.51.100.20, 10.0.0.9"), "198.51.100.20")
        self.assertEqual(self.ip("10.0.0.5"), "10.0.0.5")
        # An untrusted peer's header is ignored entirely.
        self.assertEqual(self.ip("198.51.100.7", "10.0.0.9, 203.0.113.77"), "198.51.100.7")
