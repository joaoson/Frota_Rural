import uuid
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase, TransactionTestCase, skipUnlessDBFeature
from django.utils import timezone

from api.models import Rentals
from api.test_recurrence import RecurrenceFixtures
from payments.models import Payments


class RentalAccessTests(RecurrenceFixtures, TestCase):
    def setUp(self):
        super().setUp()
        self.rental = self.conflict(day=self.first_day + timedelta(days=40), status='pending')
        self.rental.lessee = self.tenant
        self.rental.save()
        self.url = f'/api/rentals/{self.rental.pk}'

    def booking_data(self):
        return {'postings': str(self.posting.pk), 'lessee': str(self.tenant.pk),
                'start_date': self.at(self.first_day).isoformat(),
                'end_date': self.at(self.first_day, 18).isoformat()}

    def test_all_rental_routes_require_authentication(self):
        self.client.force_authenticate(None)
        for method, url, data in [('get', '/api/rentals/', {}), ('get', self.url, {}),
                                 ('post', '/api/rentals/', self.booking_data()),
                                 ('patch', self.url, {'lessee': str(self.other.pk)}),
                                 ('delete', self.url, {})]:
            response = getattr(self.client, method)(url, data, format='json')
            self.assertEqual(response.status_code, 401)

    def test_rental_and_contract_reads_are_scoped_to_parties(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get('/api/rentals/').data, [])
        for url in [self.url, f'/api/rentals/{self.source.pk}',
                    f'/api/contracts/{self.source.pk}', f'/api/contracts/{self.source.pk}/evidence']:
            self.assertEqual(self.client.get(url).status_code, 404, url)
        self.assertEqual(self.client.get('/api/contracts/').data, [])
        self.client.force_authenticate(self.owner)
        self.assertEqual(len(self.client.get('/api/rentals/').data), 2)
        self.assertEqual(self.client.get(f'/api/contracts/{self.source.pk}').status_code, 200)

    def test_other_tenant_cannot_change_or_delete_rental(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.patch(self.url, {'lessee': str(self.other.pk)}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(self.url).status_code, 404)

    def test_creation_cannot_impersonate_tenant_or_skip_payment(self):
        response = self.client.post('/api/rentals/', {**self.booking_data(), 'lessee': str(self.other.pk)}, format='json')
        self.assertEqual(response.status_code, 403)
        response = self.client.post('/api/rentals/', {**self.booking_data(), 'status': 'active'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_single_creation_price_is_server_controlled(self):
        response = self.client.post('/api/rentals/', {**self.booking_data(), 'total_price': '0.01'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['total_price'], '840.00')

    def test_identity_and_price_cannot_be_changed_after_creation(self):
        for field, value in [('lessee', str(self.other.pk)), ('postings', str(uuid.uuid4())), ('total_price', '0.01')]:
            response = self.client.patch(self.url, {field: value}, format='json')
            self.assertEqual(response.status_code, 400, response.data)
        self.rental.refresh_from_db()
        self.assertEqual(self.rental.lessee, self.tenant)
        self.assertEqual(self.rental.postings, self.posting)

    def test_status_cannot_activate_or_sign_unpaid_rental(self):
        for state in ('active', 'signed', 'completed', 'awaiting_payment'):
            self.assertEqual(self.client.patch(self.url, {'status': state}, format='json').status_code, 409)

    def test_pending_date_changes_revalidate_and_reprice(self):
        response = self.client.patch(self.url, {
            'start_date': self.at(self.first_day).isoformat(),
            'end_date': self.at(self.first_day + timedelta(days=1), 18).isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['total_price'], '1680.00')
        self.conflict(day=self.first_day + timedelta(days=10))
        response = self.client.patch(self.url, {
            'start_date': self.at(self.first_day + timedelta(days=10)).isoformat(),
            'end_date': self.at(self.first_day + timedelta(days=11), 18).isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_dates_locked_after_checkout_starts_or_payment_is_received(self):
        for state in ('pending', 'approved', 'requires_review'):
            payment = Payments.objects.create(rental=self.rental, session_id=f'cs_{state}', amount=Decimal('840.00'), status=state)
            response = self.client.patch(self.url, {'start_date': self.at(self.first_day).isoformat()}, format='json')
            self.assertEqual(response.status_code, 409)
            payment.delete()

    def test_expired_unpaid_reservation_can_be_cancelled_after_new_booking(self):
        self.rental.created_at = timezone.now() - timedelta(hours=1)
        self.rental.save()
        self.conflict(day=self.rental.start_date.date())
        response = self.client.patch(self.url, {'status': 'cancelled'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)

    def test_owner_can_complete_past_confirmed_rental_and_history_cannot_be_deleted(self):
        self.source.status = 'signed'
        self.source.save()
        self.client.force_authenticate(self.owner)
        response = self.client.patch(f'/api/rentals/{self.source.pk}', {'status': 'completed'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.client.delete(self.url).status_code, 409)


@skipUnlessDBFeature('has_select_for_update')
class RentalUpdateConcurrencyTests(RecurrenceFixtures, TransactionTestCase):
    def test_date_update_cannot_race_series_creation(self):
        rental = self.conflict(day=self.first_day + timedelta(days=50), status='pending')
        rental.lessee = self.tenant
        rental.save()
        # Use the same request coordination as creation tests, but issue a PATCH
        # for the pending rental competing with the series.
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        from django.db import close_old_connections
        from rest_framework.test import APIClient

        barrier = Barrier(2)

        def request(update):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(self.tenant)
                barrier.wait(timeout=10)
                if update:
                    return client.patch(f'/api/rentals/{rental.pk}', {
                        'start_date': self.at(self.first_day).isoformat(),
                        'end_date': self.at(self.first_day, 18).isoformat(),
                    }, format='json').status_code
                return client.post(self.create_url, {**self.payload, 'idempotency_key': str(uuid.uuid4())}, format='json').status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = list(pool.map(request, [False, True]))
        self.assertIn(statuses, ([201, 400], [409, 200]))
        self.assertEqual(Rentals.objects.filter(start_date=self.at(self.first_day)).count(), 1)
