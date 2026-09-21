import uuid
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from api.models import Reviews
from api.test_recurrence import RecurrenceFixtures
from contracts.models import Contracts
from document_validation.models import Certification
from postings.models import Postings
from users.models import Users


class DashboardFlowTests(RecurrenceFixtures, TestCase):
    def test_profile_is_private_and_cannot_be_changed_by_another_user(self):
        url = f'/api/users/{self.owner.pk}'
        for method in ('get', 'patch', 'delete'):
            response = getattr(self.client, method)(url, {'name': 'Changed'}, format='json')
            self.assertEqual(response.status_code, 404)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.name, 'owner')
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(url).status_code, 401)

    def test_profile_edit_preserves_credentials_and_privileged_fields(self):
        self.tenant.set_password('Original1234')
        self.tenant.save()
        response = self.client.patch(f'/api/users/{self.tenant.pk}', {
            'name': 'Updated tenant', 'role': 'admin', 'status': 'banned',
            'employer': str(self.owner.pk), 'password': 'RawPassword123',
        }, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.tenant.refresh_from_db()
        self.assertTrue(self.tenant.check_password('Original1234'))
        self.assertEqual(self.tenant.role, 'locatario')
        response = self.client.patch(f'/api/users/{self.tenant.pk}', {
            'name': 'Updated tenant', 'city': 'Curitiba', 'state': 'PR',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['city'], 'Curitiba')
        self.assertNotIn('password', response.data)

    def test_password_change_is_own_account_only_and_hashes_password(self):
        self.tenant.set_password('Original1234')
        self.tenant.save()
        url = f'/api/users/{self.tenant.pk}/change-password'
        payload = {'current_password': 'Original1234', 'new_password': 'Changed1234'}
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(url, payload, format='json').status_code, 404)
        self.client.force_authenticate(self.tenant)
        self.assertEqual(self.client.post(url, payload, format='json').status_code, 204)
        self.tenant.refresh_from_db()
        self.assertTrue(self.tenant.check_password('Changed1234'))

    def test_registration_cannot_create_admin_or_assign_employer(self):
        data = {'name': 'Registration', 'document': 'unique-document',
                'email': 'registration@example.test', 'address': 'Street',
                'birth_date': '1990-01-01', 'password': 'Password1234', 'role': 'admin'}
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post('/api/users/create', data, format='json').status_code, 400)
        response = self.client.post('/api/users/create', {
            **data, 'role': 'locatario', 'status': 'banned', 'employer': str(self.owner.pk),
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        account = Users.objects.get(email=data['email'])
        self.assertEqual(account.status, 'active')
        self.assertIsNone(account.employer_id)

    def test_user_directory_requires_admin(self):
        self.assertEqual(self.client.get('/api/users/').status_code, 403)
        admin = self.user('admin', 'admin')
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.get('/api/users/').status_code, 200)

    def test_machine_writes_require_owner_and_cannot_transfer_ownership(self):
        url = f'/api/machines/{self.machine.pk}'
        self.assertEqual(self.client.patch(url, {'model': 'Changed'}, format='json').status_code, 404)
        self.client.force_authenticate(self.owner)
        response = self.client.patch(url, {'owner': str(self.other.pk)}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        response = self.client.patch(url, {'model': 'Updated'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.delete(url).status_code, 401)

    def test_machine_creation_cannot_assign_someone_elses_inventory(self):
        self.client.force_authenticate(self.owner)
        response = self.client.post('/api/machines/', {
            'owner': str(self.other.pk), 'brand': 'John Deere', 'model': 'S790',
        }, format='json')
        self.assertEqual(response.status_code, 400, response.data)

    def test_owner_listing_retains_paused_posts_without_exposing_others_drafts(self):
        self.posting.status = 'paused'
        self.posting.save()
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/postings/').data, [])
        self.assertEqual(self.client.get(f'/api/postings/{self.posting.pk}').status_code, 404)
        self.client.force_authenticate(self.owner)
        response = self.client.get('/api/postings/', {'owner': str(self.owner.pk)})
        self.assertEqual([item['id'] for item in response.data], [str(self.posting.pk)])
        self.assertEqual(self.client.get(f'/api/postings/{self.posting.pk}').status_code, 200)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get('/api/postings/', {'owner': str(self.owner.pk)}).data, [])

    def test_posting_cannot_be_written_by_another_user(self):
        url = f'/api/postings/{self.posting.pk}'
        self.assertEqual(self.client.patch(url, {'hourly_rate': '0.01'}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(url).status_code, 404)
        self.assertEqual(self.client.post(url + '/photos/', {}, format='multipart').status_code, 404)
        self.assertEqual(self.client.post('/api/postings/', {
            'machinery': str(self.machine.pk), 'hourly_rate': '100.00',
        }, format='json').status_code, 400)

    def test_posting_cannot_delete_rental_history_or_set_invalid_price_or_dates(self):
        self.client.force_authenticate(self.owner)
        url = f'/api/postings/{self.posting.pk}'
        self.assertEqual(self.client.delete(url).status_code, 409)
        self.assertTrue(Postings.objects.filter(pk=self.posting.pk).exists())
        for payload in ({'hourly_rate': '-2.00'}, {'hourly_rate': '0.00'},
                        {'availability_start': (timezone.now() + timedelta(days=2)).isoformat(),
                         'availability_end': timezone.now().isoformat()}):
            self.assertEqual(self.client.patch(url, payload, format='json').status_code, 400)

    def review_payload(self, **overrides):
        return {'rental': str(self.source.pk), 'reviewer': str(self.tenant.pk),
                'reviewee': str(self.owner.pk), 'rating': 5, 'comment': 'Good rental', **overrides}

    def test_review_uses_real_completed_rental_counterparties(self):
        response = self.client.post('/api/reviews/', self.review_payload(), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['reviewee'], self.owner.pk)
        self.assertEqual(self.client.get(f'/api/rentals/{self.source.pk}').data['lessor_id'], str(self.owner.pk))

    def test_review_rejects_impersonation_invalid_target_and_invalid_rating(self):
        for payload in (self.review_payload(reviewer=str(self.other.pk)),
                        self.review_payload(reviewee=str(self.other.pk)),
                        self.review_payload(rating=0), self.review_payload(rating=6)):
            response = self.client.post('/api/reviews/', payload, format='json')
            self.assertEqual(response.status_code, 400, response.data)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post('/api/reviews/', self.review_payload(reviewer=str(self.other.pk)), format='json').status_code, 400)
        self.assertEqual(Reviews.objects.count(), 0)

    def test_review_requires_completed_rental_and_author_for_changes(self):
        self.source.status = 'pending'
        self.source.save()
        self.assertEqual(self.client.post('/api/reviews/', self.review_payload(), format='json').status_code, 400)
        self.source.status = 'completed'
        self.source.save()
        response = self.client.post('/api/reviews/', self.review_payload(), format='json')
        url = f'/api/reviews/{response.data["id"]}'
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.patch(url, {'rating': 1}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(url).status_code, 404)
        self.client.force_authenticate(self.tenant)
        self.assertEqual(self.client.patch(url, {'rating': 4}, format='json').status_code, 200)

    def test_cancellation_also_closes_the_unsigned_contract(self):
        rental = self.conflict(status='pending')
        rental.lessee = self.tenant
        rental.save()
        contract = Contracts.objects.create(id=uuid.uuid4(), rental=rental, status='pending_signatures')
        response = self.client.patch(f'/api/rentals/{rental.pk}', {'status': 'cancelled'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        contract.refresh_from_db()
        self.assertEqual(contract.status, 'cancelled')
        self.assertEqual(response.data['contract_status'], 'cancelled')

    def test_certifications_are_private_and_cannot_be_self_approved(self):
        payload = {'user': str(self.tenant.pk), 'title': 'NR-31',
                   'issuing_organization': 'Training', 'issue_date': '2026-01-01',
                   'description': 'Course', 'validation_status': 'approved'}
        response = self.client.post('/api/certifications/', payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['validation_status'], 'pending')
        url = f'/api/certifications/{response.data["id"]}'
        self.assertEqual(self.client.patch(url + '/review', {'validation_status': 'approved'}, format='json').status_code, 403)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get('/api/certifications/').data, [])
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.post('/api/certifications/', payload, format='json').status_code, 400)

    def test_document_review_is_admin_only_and_owner_edits_require_reapproval(self):
        certification = Certification.objects.create(
            id=uuid.uuid4(), user=self.tenant, title='NR-31', issuing_organization='Training',
            issue_date='2026-01-01', description='Course', validation_status='pending',
        )
        url = f'/api/certifications/{certification.pk}'
        admin = self.user('admin', 'admin')
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.get('/api/certifications/').status_code, 200)
        response = self.client.patch(url + '/review', {'validation_status': 'approved'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.client.force_authenticate(self.tenant)
        response = self.client.patch(url, {'title': 'NR-31 updated'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['validation_status'], 'pending')
        self.assertIsNone(response.data['review_note'])
        self.assertEqual(self.client.patch(url, {'user': str(self.other.pk)}, format='json').status_code, 400)

    def test_cnh_documents_are_scoped_and_owner_cannot_self_approve(self):
        payload = {
            'user': str(self.tenant.pk), 'name': 'Tenant', 'birth_date': '1990-01-01',
            'cpf': '11122233344', 'rg': '123456789', 'mother_name': 'Mother',
            'nationality': 'Brasileira', 'birth_place': 'Curitiba', 'cnh_number': '12345678901',
            'category': 'B', 'first_license_date': '2010-01-01', 'issue_date': '2026-01-01',
            'expiration_date': '2030-01-01', 'issuing_state': 'PR', 'issuing_authority': 'DETRAN',
            'situation': 'active', 'validation_status': 'approved',
        }
        response = self.client.post('/api/operator-licenses/', payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['validation_status'], 'pending')
        url = f'/api/operator-licenses/{response.data["id"]}'
        self.assertEqual(self.client.patch(url + '/review', {'validation_status': 'approved'}, format='json').status_code, 403)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get('/api/operator-licenses/').data, [])
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.patch(url, {'name': 'Other'}, format='json').status_code, 404)
        self.assertEqual(self.client.post('/api/operator-licenses/', payload, format='json').status_code, 400)
        self.client.force_authenticate(self.user('admin', 'admin'))
        self.assertEqual(self.client.get(url).status_code, 200)
        self.assertEqual(self.client.patch(url + '/review', {'validation_status': 'approved'}, format='json').status_code, 200)

    def test_anonymous_document_uploads_and_analysis_require_login(self):
        self.client.force_authenticate(None)
        for url in ('/api/documents/upload/', '/api/operator-licenses/validate-document/',
                    '/api/certifications/', '/api/operator-licenses/'):
            self.assertEqual(self.client.post(url, {}, format='multipart').status_code, 401)

    def test_only_admin_can_moderate_accounts(self):
        url = f'/api/admin/users/{self.owner.pk}/warn'
        self.assertEqual(self.client.put(url).status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.put(url).status_code, 401)
        self.client.force_authenticate(self.user('admin', 'admin'))
        self.assertEqual(self.client.put(url).status_code, 200)

    def test_admin_suspension_and_ban_close_the_same_pending_contracts(self):
        self.client.force_authenticate(self.user('admin', 'admin'))
        for action in ('suspend', 'ban'):
            rental = self.conflict(status='pending')
            contract = Contracts.objects.create(id=uuid.uuid4(), rental=rental, status='pending_signatures')
            response = self.client.put(f'/api/admin/users/{self.other.pk}/{action}')
            self.assertEqual(response.status_code, 200, response.data)
            rental.refresh_from_db()
            contract.refresh_from_db()
            self.assertEqual(rental.status, 'cancelled')
            self.assertEqual(contract.status, 'cancelled')

    def test_invalid_query_identifiers_are_400_not_server_errors(self):
        for url, field in [('/api/postings/', 'machinery'), ('/api/machines/', 'owner'),
                           ('/api/rentals/', 'lessee'), ('/api/reviews/', 'reviewee'),
                           ('/api/certifications/', 'user')]:
            response = self.client.get(url, {field: 'not-a-uuid'})
            self.assertEqual(response.status_code, 400, (url, response.data))
