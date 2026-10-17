from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from django.db import close_old_connections
from django.test import TestCase, TransactionTestCase, override_settings, skipUnlessDBFeature
from rest_framework.test import APIClient

from api.test_recurrence import RecurrenceFixtures
from api.models import RentalRecurrence
from contracts.models import ContractSignatures
from payments.models import Payments


class SignatureFixtures(RecurrenceFixtures):
    def setUp(self):
        super().setUp()
        self.create()
        self.rental = RentalRecurrence.objects.get().rentals.order_by('recurrence_index').first()
        self.url = f'/api/contracts/{self.rental.pk}/sign'

    def paid(self):
        self.rental.status = 'active'
        self.rental.save()
        return Payments.objects.create(rental=self.rental, session_id='cs_signature', status='approved', amount=self.rental.total_price)


@override_settings(CONTRACT_SIGNATURE_REQUIRE_OTP=False)
class SignatureAccessTests(SignatureFixtures, TestCase):
    def test_contract_routes_require_authentication(self):
        self.client.force_authenticate(None)
        for url in ['/api/contracts', f'/api/contracts/{self.rental.pk}', f'/api/contracts/{self.rental.pk}/evidence']:
            self.assertEqual(self.client.get(url).status_code, 401)
        for url in [self.url, f'/api/contracts/{self.rental.pk}/otp']:
            self.assertEqual(self.client.post(url, {'role': 'locatario'}, format='json').status_code, 401)

    def test_unpaid_signature_cannot_activate_reservation_or_create_evidence(self):
        for role, party in [('locatario', self.tenant), ('locador', self.owner)]:
            self.client.force_authenticate(party)
            response = self.client.post(self.url, {'role': role}, format='json')
            self.assertEqual(response.status_code, 409, response.data)
        self.rental.refresh_from_db()
        self.assertEqual(self.rental.status, 'pending')
        self.assertFalse(self.rental.contracts.accepted_by_lessee)
        self.assertFalse(self.rental.contracts.accepted_by_lessor)
        self.assertEqual(ContractSignatures.objects.count(), 0)

    def test_active_rental_without_approved_payment_is_not_enough(self):
        self.rental.status = 'active'
        self.rental.save()
        self.assertEqual(self.client.post(self.url, {'role': 'locatario'}, format='json').status_code, 409)

    def test_expired_hold_cannot_be_reactivated_over_another_reservation(self):
        self.rental.reservation_expires_at = self.source.created_at
        self.rental.save()
        self.conflict()
        self.assertEqual(self.client.post(self.url, {'role': 'locatario'}, format='json').status_code, 409)
        self.assertEqual(ContractSignatures.objects.count(), 0)

    def test_approved_payment_allows_both_parties_to_sign_with_fresh_evidence(self):
        self.paid()
        response = self.client.post(self.url, {'role': 'locatario'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.client.force_authenticate(self.owner)
        response = self.client.post(self.url, {'role': 'locador'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.rental.refresh_from_db()
        self.assertEqual(self.rental.status, 'signed')
        self.assertTrue(self.rental.contracts.accepted_by_lessee)
        self.assertTrue(self.rental.contracts.accepted_by_lessor)
        self.assertEqual(ContractSignatures.objects.count(), 2)
        self.assertEqual(self.client.post(self.url, {'role': 'locador'}, format='json').status_code, 409)

    def test_other_tenant_and_wrong_party_cannot_sign(self):
        self.paid()
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(self.url, {'role': 'locatario'}, format='json').status_code, 404)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post(self.url, {'role': 'locatario'}, format='json').status_code, 403)


@override_settings(CONTRACT_SIGNATURE_REQUIRE_OTP=False)
@skipUnlessDBFeature('has_select_for_update')
class SignatureConcurrencyTests(SignatureFixtures, TransactionTestCase):
    def test_simultaneous_signatures_preserve_both_acceptances_and_evidence_chain(self):
        self.paid()
        barrier = Barrier(2)

        def sign(pair):
            role, user = pair
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(user)
                barrier.wait(timeout=10)
                return client.post(self.url, {'role': role}, format='json').status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(list(pool.map(sign, [('locatario', self.tenant), ('locador', self.owner)])), [200, 200])
        self.rental.refresh_from_db()
        self.assertEqual(self.rental.status, 'signed')
        self.assertTrue(self.rental.contracts.accepted_by_lessee)
        self.assertTrue(self.rental.contracts.accepted_by_lessor)
        signatures = list(ContractSignatures.objects.order_by('signed_at', 'id'))
        self.assertEqual(len(signatures), 2)
        self.assertEqual(signatures[1].previous_hash, signatures[0].record_hash)
