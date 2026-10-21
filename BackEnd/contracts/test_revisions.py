"""Frozen contract revisions: both parties sign one immutable document (plan step 1.2)."""

import json
import uuid
from datetime import timedelta
from unittest.mock import patch

from django.db import DatabaseError, connection, transaction
from django.test import override_settings

from contracts import contract_template, signature_evidence
from contracts.contract_document import build_legacy_document
from contracts.models import Contracts, ContractRevisions, ContractSignatureOtps, ContractSignatures, ImmutableRecordError
from contracts.revisions import freeze_revision
from contracts.services import ContractService
from contracts.tests import ContractTestCase, auth
from payments.models import Payments
from payments.services import PaymentService
from rentals.models import Rentals
from users.models import Users


@override_settings(CONTRACT_SIGNATURE_REQUIRE_OTP=False)
class ContractRevisionTests(ContractTestCase):
    def document(self, as_user=None):
        response = self.client.get(f"/api/contracts/{self.contract.id}", **auth(as_user or self.lessee))
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def test_profile_edit_between_signatures_does_not_change_the_signed_document(self):
        # Audit reproduction: sign as tenant, change the tenant address, sign as owner.
        self.assertEqual(self.sign("locatario").status_code, 200)
        Users.objects.filter(pk=self.lessee.pk).update(address="Endereço novo, 999 - Ponta Grossa/PR")
        response = self.sign("locador")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["status"], "signed")

        hashes = set(ContractSignatures.objects.values_list("document_hash", flat=True))
        self.assertEqual(len(hashes), 1)
        self.assertEqual(hashes, {self.contract_revision().document_hash})
        self.assertEqual(self.document()["locatario"]["endereco_completo"], "Rua Teste, 100 - Castro/PR")
        evidence = self.client.get(f"/api/contracts/{self.contract.id}/evidence").json()
        self.assertTrue(evidence["cadeia_integra"], evidence["inconsistencias"])
        self.assertEqual(evidence["documento"]["revisao"], 1)

    def contract_revision(self):
        self.contract.refresh_from_db()
        return self.contract.current_revision

    def test_listing_machine_and_profile_edits_after_freezing_leave_the_document_unchanged(self):
        before = self.document()
        self.rental.postings.hourly_rate = "999.00"
        self.rental.postings.save(update_fields=["hourly_rate"])
        machine = self.rental.postings.machinery
        machine.brand = "Outra marca"
        machine.save(update_fields=["brand"])
        Users.objects.filter(pk=self.owner.pk).update(name="Outro nome")
        after = self.document()
        self.assertEqual(after["evidencia"]["hash_documento_atual"], before["evidencia"]["hash_documento_atual"])
        self.assertEqual(after["equipamento"]["marca"], "John Deere")
        self.assertEqual(after["locador"]["razao_social"], "Locador 1")
        self.assertEqual(after["revisao"]["numero"], 1)

    def test_clause_text_is_part_of_the_frozen_hash(self):
        document = self.document()
        revision = self.contract_revision()
        self.assertEqual(document["contrato"]["versao_documento"], "2.0.0")
        self.assertEqual(revision.document["clausulas"], document["clausulas"])
        self.assertEqual(signature_evidence.document_hash(revision.document), revision.document_hash)
        # A later template change affects new documents only, never a frozen revision.
        with patch.object(contract_template, "PREAMBULO", "Texto alterado depois do pagamento."):
            self.assertEqual(self.document()["preambulo"], document["preambulo"])

    def test_v2_text_promises_no_hour_based_charge_or_unimplemented_workflow(self):
        text = json.dumps(self.document()["clausulas"], ensure_ascii=False)
        self.assertIn("não há cobrança adicional nem devolução em função do uso", text)
        self.assertIn("servem apenas para acompanhamento de uso", text)
        for promise in ("diretamente ao Locador", "Valor final apurado", "foto do horímetro",
                        "cancelada automaticamente", "valor total estimado"):
            self.assertNotIn(promise, text)

    def test_stale_revision_is_rejected_without_recording_a_signature(self):
        self.assertEqual(self.sign("locatario", revision_id=str(uuid.uuid4())).status_code, 409)
        response = self.sign("locatario", revision_id=None)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "stale_revision")
        self.assertFalse(ContractSignatures.objects.exists())

    def test_viewer_of_a_superseded_revision_cannot_sign_the_new_one(self):
        seen = self.document()["revisao"]["id"]
        locked = Contracts.objects.get(pk=self.contract.pk)
        freeze_revision(locked, reason="amendment")  # e.g. an accepted amendment
        response = self.sign("locatario", revision_id=seen)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "stale_revision")
        self.assertEqual(self.sign("locatario").status_code, 200)

    def test_contract_is_signed_only_when_both_roles_accept_the_same_revision(self):
        self.assertEqual(self.sign("locatario").status_code, 200)
        locked = Contracts.objects.get(pk=self.contract.pk)
        freeze_revision(locked, reason="amendment")
        response = self.sign("locador")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["status"], "pending_signatures")
        self.assertFalse(response.json()["accepted_by_lessee"])
        response = self.sign("locatario")
        self.assertEqual(response.json()["status"], "signed")
        self.rental.refresh_from_db()
        self.assertEqual(self.rental.status, "signed")
        self.assertEqual(ContractSignatures.objects.filter(revision__number=2).count(), 2)

    def test_payment_approval_freezes_the_first_revision(self):
        start = self.rental.end_date + timedelta(days=10)
        rental = Rentals.objects.create(
            id=uuid.uuid4(), postings=self.rental.postings, lessee=self.lessee, start_date=start,
            end_date=start, total_price="840.00", status="awaiting_payment",
        )
        contract = ContractService.create_for_rental(rental)
        Payments.objects.create(rental=rental, session_id="cs_freeze", amount="840.00")
        self.assertIsNone(contract.current_revision_id)
        PaymentService._approve("cs_freeze")
        contract.refresh_from_db()
        self.assertEqual(contract.current_revision.number, 1)
        self.assertEqual(contract.current_revision.reason, "initial")
        self.assertIn("clausulas", contract.current_revision.document)

    def test_unpaid_contract_is_a_preview_without_revision(self):
        Rentals.objects.filter(pk=self.rental.pk).update(status="pending")
        Payments.objects.all().delete()
        document = self.document()
        self.assertTrue(document["previa"])
        self.assertIsNone(document["revisao"])
        self.assertEqual(document["contrato"]["versao_documento"], "2.0.0")
        self.assertFalse(ContractRevisions.objects.exists())

    def test_legacy_contract_keeps_its_1_0_0_document_and_two_boolean_flow(self):
        # A signature recorded before revisions existed, on the 1.0.0 document.
        signature_evidence.record_signature(
            contract=self.contract, document=build_legacy_document(self.contract), role="locatario",
            signer=self.lessee,
        )
        Contracts.objects.filter(pk=self.contract.pk).update(accepted_by_lessee=True)
        document = self.document(self.owner)
        self.assertTrue(document["legado"])
        self.assertIsNone(document["revisao"])
        self.assertEqual(document["contrato"]["versao_documento"], "1.0.0")
        self.assertIn("valor_total_estimado", document["contrato"])

        response = self.sign("locador")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["status"], "signed")
        self.assertFalse(ContractRevisions.objects.exists())
        evidence = self.client.get(f"/api/contracts/{self.contract.id}/evidence").json()
        self.assertTrue(evidence["cadeia_integra"], evidence["inconsistencias"])
        self.assertIsNone(evidence["documento"]["revisao"])

    def test_revisions_are_append_only_in_the_model_and_the_database(self):
        revision = ContractRevisions.objects.get(pk=self.document()["revisao"]["id"])
        with self.assertRaises(ImmutableRecordError):
            revision.save()
        with self.assertRaises(ImmutableRecordError):
            revision.delete()
        for sql in ("UPDATE contract_revisions SET document_hash = 'x' WHERE id = %s",
                    "DELETE FROM contract_revisions WHERE id = %s"):
            with self.subTest(sql=sql), self.assertRaises(DatabaseError), transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(sql, [revision.pk])

    def test_otp_cannot_be_burned_by_a_stale_view(self):
        with override_settings(CONTRACT_SIGNATURE_REQUIRE_OTP=True), \
                patch("contracts.services.send_contract_signature_otp_email") as send:
            revision_id = self.document()["revisao"]["id"]
            self.client.post(f"/api/contracts/{self.contract.id}/otp",
                             {"role": "locatario", "revision_id": revision_id},
                             content_type="application/json", **auth(self.lessee))
            code = send.call_args.kwargs["code"]
            response = self.sign("locatario", otp=code, revision_id=str(uuid.uuid4()))
        self.assertEqual(response.status_code, 409)
        otp = ContractSignatureOtps.objects.get()
        self.assertIsNone(otp.consumed_at)
        self.assertEqual(otp.attempts, 0)
