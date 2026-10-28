"""Execute os exemplos publicados no Swagger com recursos do banco de teste.

Somente IDs, datas e OTPs são substituídos, como orienta o guia. A API, o ORM,
os cálculos, a revisão e a verificação do OTP são reais; o envio de e-mail é mockado.
"""

from copy import deepcopy
from datetime import timedelta
from unittest.mock import patch

from django.test import override_settings
from django.utils import timezone
from drf_spectacular.generators import SchemaGenerator
from rest_framework_simplejwt.tokens import AccessToken

from contracts.tests import ContractTestCase, auth


@override_settings(CONTRACT_SIGNATURE_REQUIRE_OTP=True)
class DocumentedExampleTests(ContractTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.schema = SchemaGenerator().get_schema(request=None, public=True)

    def setUp(self):
        super().setUp()
        machine = self.rental.postings.machinery
        machine.status = "active"
        machine.save(update_fields=["status"])

    def example(self, path, method="post", index=0, **replacements):
        examples = self.schema["paths"][path][method]["requestBody"]["content"]["application/json"]["examples"]
        payload = deepcopy(list(examples.values())[index]["value"])
        # Do not add absent fields: an incomplete published example must fail.
        return {key: replacements.get(key, value) for key, value in payload.items()}

    def post_json(self, path, payload, user=None):
        return self.client.post(path, payload, content_type="application/json", **auth(user or self.lessee))

    def create_from_example(self):
        start = timezone.now().replace(microsecond=0) + timedelta(days=10)
        payload = self.example("/api/rentals", postings=str(self.rental.postings_id),
                               lessee=str(self.lessee.pk), start_date=start.isoformat(),
                               end_date=(start + timedelta(days=2)).isoformat())
        self.assertNotIn("total_price", payload)
        response = self.post_json("/api/rentals", payload)
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def test_reservation_and_patch_examples_obey_price_and_state_rules(self):
        rental = self.create_from_example()
        self.assertEqual(rental["total_price"], "2520.00")
        self.assertEqual(rental["billable_days"], 3)
        self.assertEqual(rental["status"], "pending")
        self.assertIsNotNone(rental["contract_id"])
        url = f'/api/rentals/{rental["id"]}'
        payload = self.example("/api/rentals/{id}", "patch")
        updated = self.client.patch(url, payload, content_type="application/json")
        self.assertEqual(updated.status_code, 200, updated.content)
        self.assertEqual(updated.json()["notes"], payload["notes"])
        self.assertEqual(updated.json()["total_price"], rental["total_price"])
        forbidden = self.client.patch(url, {"status": "active"}, content_type="application/json")
        self.assertEqual(forbidden.status_code, 409)
        self.assertEqual(forbidden.json()["code"], "use_rental_action")
        self.assertEqual(self.client.delete(url).status_code, 409)

    def test_otp_and_both_signature_examples_accept_the_document_read_by_each_party(self):
        url = f"/api/contracts/{self.contract.pk}"
        revision = self.revision_id()
        for index, (role, user) in enumerate((("locatario", self.lessee), ("locador", self.owner))):
            with self.subTest(role=role):
                self.assertEqual(self.revision_id(user), revision)
                otp_payload = self.example("/api/contracts/{id}/otp", role=role, revision_id=revision)
                with patch("contracts.services.send_contract_signature_otp_email") as send:
                    issued = self.post_json(f"{url}/otp", otp_payload, user)
                self.assertEqual(issued.status_code, 200, issued.content)
                sign_payload = self.example("/api/contracts/{id}/sign", index=index,
                                            revision_id=revision, otp=send.call_args.kwargs["code"])
                signed = self.post_json(f"{url}/sign", sign_payload, user)
                self.assertEqual(signed.status_code, 200, signed.content)
                self.assertTrue(signed.json()["signature_evidence"]["otp_verified"])
                self.assertEqual(signed.json()["signature_evidence"]["revision"], revision)
        self.assertEqual(signed.json()["status"], "signed")
        evidence = self.client.get(f"{url}/evidence").json()
        self.assertTrue(evidence["cadeia_integra"])
        self.assertEqual(len(evidence["assinaturas"]), 2)

    def test_recurrence_examples_create_three_reservations_and_retry_without_duplicates(self):
        first = (timezone.localdate() + timedelta(days=40)).isoformat()
        url = f"/api/rentals/{self.rental.pk}/recurrence"
        preview = self.post_json(f"{url}/preview", self.example(
            "/api/rentals/{id}/recurrence/preview", first_start_date=first))
        self.assertEqual(preview.status_code, 200, preview.content)
        self.assertEqual(len(preview.json()["dates"]), 3)
        payload = self.example("/api/rentals/{id}/recurrence", first_start_date=first)
        created = self.post_json(url, payload)
        self.assertEqual(created.status_code, 201, created.content)
        self.assertEqual(len(created.json()["rentals"]), 3)
        self.assertEqual(created.json()["total_price"], preview.json()["total_price"])
        retried = self.post_json(url, payload)
        self.assertEqual(retried.status_code, 201, retried.content)
        self.assertEqual(retried.json()["id"], created.json()["id"])
        self.assertEqual([r["id"] for r in retried.json()["rentals"]],
                         [r["id"] for r in created.json()["rentals"]])

    def test_amendment_example_preserves_three_daily_rates_and_changes_revision_on_accept(self):
        revision = self.revision_id()
        start = timezone.now() + timedelta(days=20)
        payload = self.example("/api/contracts/{id}/amendments", base_revision=revision,
                               proposed_start=start.isoformat(), proposed_end=(start + timedelta(days=2)).isoformat())
        url = f"/api/contracts/{self.contract.pk}/amendments"
        proposed = self.post_json(url, payload)
        self.assertEqual(proposed.status_code, 201, proposed.content)
        accepted = self.post_json(f'{url}/{proposed.json()["id"]}/accept', {}, self.owner)
        self.assertEqual(accepted.status_code, 200, accepted.content)
        self.assertNotEqual(self.revision_id(), revision)
        self.rental.refresh_from_db()
        self.assertEqual(str(self.rental.total_price), "2520.00")

    def test_cancel_example_records_cancellation_and_keeps_history(self):
        rental = self.create_from_example()
        url = f'/api/rentals/{rental["id"]}/cancel'
        payload = self.example("/api/rentals/{id}/cancel")
        cancelled = self.post_json(url, payload)
        self.assertEqual(cancelled.status_code, 200, cancelled.content)
        self.assertEqual(cancelled.json()["status"], "cancelled")
        self.assertEqual(cancelled.json()["cancellation_reason"], payload["reason"])
        self.assertEqual(self.client.get(f'/api/rentals/{rental["id"]}').status_code, 200)

    def test_verification_returns_the_documented_empty_json_object(self):
        response = self.post_json("/api/login/verify", {"token": str(AccessToken.for_user(self.lessee))})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json(), {})

    def test_meter_and_completion_examples_record_usage_without_changing_price(self):
        self.rental.status = "signed"
        self.rental.start_date = timezone.now() - timedelta(days=3)
        self.rental.end_date = timezone.now() - timedelta(days=1)
        self.rental.save()
        self.contract.status = "signed"
        self.contract.accepted_by_lessor = self.contract.accepted_by_lessee = True
        self.contract.save()
        url = f"/api/rentals/{self.rental.pk}"
        reading = self.post_json(f"{url}/meter-readings",
                                 self.example("/api/rentals/{id}/meter-readings"), self.owner)
        self.assertEqual(reading.status_code, 201, reading.content)
        self.assertEqual(reading.json()["reading"]["value"], 1250)
        self.assertEqual(reading.json()["warnings"], [])
        self.assertEqual(reading.json()["rental"]["total_price"], "2520.00")
        completed = self.post_json(f"{url}/complete",
                                   self.example("/api/rentals/{id}/complete", index=1), self.owner)
        self.assertEqual(completed.status_code, 200, completed.content)
        self.assertEqual(completed.json()["status"], "completed")
        self.assertEqual(completed.json()["total_price"], "2520.00")
        usage = self.client.get(f"/api/machines/{self.rental.postings.machinery_id}/usage", **auth(self.owner))
        self.assertEqual(usage.status_code, 200, usage.content)
        self.assertEqual(usage.json()["horas_registradas"], 24)
        self.assertEqual(usage.json()["media_horas_por_diaria"], "8.0")
        self.assertEqual(usage.json()["ultima_leitura"]["valor"], 1274)
