"""PR I: proposta não muda a reserva; só a contraparte aceita datas disponíveis."""
from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

from django.test import override_settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from contracts.models import ContractAmendments, ContractRevisions, ContractSignatures
from contracts.revisions import freeze_revision
from contracts.tests import ContractTestCase, auth
from payments.models import Payments, Refunds
from payments.pricing import cotar
from rentals.models import Rentals


@override_settings(CONTRACT_SIGNATURE_REQUIRE_OTP=False)
class AmendmentTests(ContractTestCase):
    def setUp(self):
        super().setUp()
        self.rental.start_date = timezone.now() + timedelta(days=14)
        self.rental.end_date = self.rental.start_date + timedelta(days=2)
        for key, value in cotar(self.rental.postings, self.rental.start_date, self.rental.end_date).snapshot().items():
            setattr(self.rental, key, value)
        self.rental.save()
        machine = self.rental.postings.machinery
        machine.status = "active"
        machine.save(update_fields=["status"])
        self.contract.rental = self.rental
        self.revision = freeze_revision(self.contract)
        self.url = f"/api/contracts/{self.contract.pk}/amendments"
        self.start = self.rental.start_date + timedelta(days=20)
        self.end = self.rental.end_date + timedelta(days=20)
        self.payload = {"base_revision": str(self.revision.pk), "proposed_start": self.start.isoformat(),
                        "proposed_end": self.end.isoformat(), "reason": "Ajustar a colheita."}

    def propose(self, user=None, **extra):
        return self.client.post(self.url, {**self.payload, **extra}, content_type="application/json", **auth(user or self.lessee))

    def decide(self, amendment, action="accept", user=None):
        return self.client.post(f"{self.url}/{amendment}/{action}", {}, content_type="application/json", **auth(user or self.owner))

    def test_acceptance_preserves_price_history_and_requires_both_signatures_again(self):
        self.assertEqual(self.sign("locatario").status_code, 200)
        self.assertEqual(self.sign("locador").status_code, 200)
        original_hash = self.revision.document_hash
        response = self.propose()
        self.assertEqual(response.status_code, 201, response.content)
        amendment = response.json()["id"]
        self.rental.refresh_from_db()
        self.assertNotEqual(self.rental.start_date, self.start)
        price = self.rental.total_price
        self.owner.name = "Cadastro alterado depois da assinatura"
        self.owner.save(update_fields=["name"])
        self.rental.postings.hourly_rate = 999
        self.rental.postings.save(update_fields=["hourly_rate"])
        response = self.decide(amendment)
        self.assertEqual(response.status_code, 200, response.content)
        self.rental.refresh_from_db()
        self.contract.refresh_from_db()
        self.assertEqual(self.rental.start_date, self.start)
        self.assertEqual(self.rental.total_price, price)
        self.assertEqual(self.rental.status, "active")
        self.assertEqual(self.contract.status, "pending_signatures")
        self.assertFalse(self.contract.accepted_by_lessor)
        self.assertFalse(self.contract.accepted_by_lessee)
        self.assertEqual(self.contract.current_revision.document["locador"], self.revision.document["locador"])
        self.assertEqual(self.contract.current_revision.document["contrato"]["valor_unitario"], self.revision.document["contrato"]["valor_unitario"])
        self.assertEqual(self.contract.signature_deadline, self.start - timedelta(hours=24))
        self.assertEqual(ContractRevisions.objects.get(pk=self.revision.pk).document_hash, original_hash)
        self.assertEqual(ContractSignatures.objects.count(), 2)
        document = self.client.get(f"/api/contracts/{self.contract.pk}").json()
        self.assertEqual(document["evidencia"]["assinaturas"], [])
        self.assertIn("sign", document["gestao"]["allowed_actions"])
        self.assertIn("amend", document["gestao"]["allowed_actions"])
        self.assertIsNotNone(document["prazo_assinatura"])
        self.assertEqual(document["assinatura"], {"data_locador": "—", "data_locatario": "—"})
        self.assertEqual(self.sign("locador", revision_id=str(self.revision.pk)).status_code, 409)
        self.assertEqual(self.sign("locador").status_code, 200)
        self.assertEqual(self.sign("locatario").status_code, 200)
        self.assertEqual(ContractSignatures.objects.count(), 4)
        self.assertEqual(self.decide(amendment).status_code, 200)
        self.assertEqual(ContractRevisions.objects.count(), 2)
        self.assertEqual(Payments.objects.count(), 1)
        self.assertFalse(Refunds.objects.exists())
        evidence = self.client.get(f"/api/contracts/{self.contract.pk}/evidence").json()
        self.assertTrue(evidence["cadeia_integra"], evidence["inconsistencias"])

    def test_reject_or_withdraw_preserves_original_dates(self):
        for action, actor in (("reject", self.owner), ("withdraw", self.lessee)):
            amendment = self.propose().json()["id"]
            self.assertEqual(self.decide(amendment, action, actor).status_code, 200)
            self.rental.refresh_from_db()
            self.assertNotEqual(self.rental.start_date, self.start)
        self.assertEqual(ContractRevisions.objects.count(), 1)

    def test_only_counterparty_decides_and_only_proposer_withdraws(self):
        amendment = self.propose().json()["id"]
        for action in ("accept", "reject"):
            self.assertEqual(self.decide(amendment, action, self.lessee).status_code, 403)
        self.assertEqual(self.decide(amendment, "withdraw", self.owner).status_code, 403)
        self.assertEqual(self.decide(amendment, user=self.stranger).status_code, 404)
        self.assertEqual(self.client.get(self.url, **auth(self.stranger)).status_code, 404)

    def test_owner_may_propose_and_tenant_accepts(self):
        amendment = self.propose(self.owner).json()["id"]
        self.assertEqual(self.decide(amendment, user=self.lessee).status_code, 200)

    def test_dates_same_duration_lead_time_and_single_pending_proposal(self):
        self.assertEqual(self.propose(proposed_end=(self.end + timedelta(days=1)).isoformat()).status_code, 400)
        soon = timezone.now() + timedelta(days=3)
        self.assertEqual(self.propose(proposed_start=soon.isoformat(), proposed_end=(soon + timedelta(days=2)).isoformat()).status_code, 400)
        self.assertEqual(self.propose().status_code, 201)
        self.assertEqual(self.propose().status_code, 409)
        self.assertEqual(ContractAmendments.objects.count(), 1)

    def test_availability_is_rechecked_at_acceptance_without_partial_changes(self):
        amendment = self.propose().json()["id"]
        Rentals.objects.create(id=uuid4(), postings=self.rental.postings, lessee=self.stranger,
                               start_date=self.start, end_date=self.end, status="active")
        response = self.decide(amendment)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "period_unavailable")
        self.rental.refresh_from_db()
        self.assertNotEqual(self.rental.start_date, self.start)
        self.assertEqual(ContractRevisions.objects.count(), 1)
        self.assertEqual(ContractAmendments.objects.get().status, "pending")

    def test_stale_base_revision_cannot_be_proposed_or_accepted(self):
        self.assertEqual(self.propose(base_revision=str(uuid4())).status_code, 409)
        amendment = self.propose().json()["id"]
        freeze_revision(self.contract, reason="amendment")
        self.assertEqual(self.decide(amendment).status_code, 409)

    def test_closed_rentals_and_expired_proposals_cannot_change_dates(self):
        amendment = self.propose().json()["id"]
        ContractAmendments.objects.filter(pk=amendment).update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.decide(amendment).status_code, 409)
        self.assertEqual(self.client.get(self.url).json()[0]["status"], "expired")
        for status in ("cancelled", "completed", "closed"):
            Rentals.objects.filter(pk=self.rental.pk).update(status=status)
            self.assertEqual(self.propose().status_code, 409)

    def test_acceptance_rechecks_lead_time(self):
        amendment = self.propose().json()["id"]
        with patch("contracts.amendments.policy.ensure_lead_time", side_effect=ValidationError("Prazo")):
            self.assertEqual(self.decide(amendment).status_code, 400)
        self.assertEqual(ContractRevisions.objects.count(), 1)
