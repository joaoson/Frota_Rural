import uuid
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import Rentals
from contracts.models import Contracts
from machines.models import Machines
from postings.models import Postings
from users.models import Users

from .availability import tem_conflito
from .models import Payments
from .views import _aprovar, _expirar


class CheckoutReservationTests(TestCase):
    def setUp(self):
        self.owner, self.renter = [Users.objects.create(
            id=uuid.uuid4(), name=role, document=role, email=f'{role}@checkout.test',
            role=role, status='active', address='Castro, PR', birth_date=date(1990, 1, 1),
        ) for role in ('locador', 'locatario')]
        self.machine = Machines.objects.create(
            id=uuid.uuid4(), owner=self.owner, brand='John Deere', model='6110J',
            renagro_number='BR-CHECKOUT', status='active',
        )
        self.posting = Postings.objects.create(
            id=uuid.uuid4(), machinery=self.machine, hourly_rate='180.00', status='active',
        )
        start = (timezone.now() + timedelta(days=14)).replace(hour=8, minute=0, second=0, microsecond=0)
        self.rental = Rentals.objects.create(
            id=uuid.uuid4(), postings=self.posting, lessee=self.renter,
            start_date=start, end_date=start + timedelta(days=1, hours=10),
            status='pending', total_price='1.00', created_at=timezone.now() - timedelta(hours=2),
            reservation_expires_at=timezone.now() - timedelta(hours=1),
        )
        self.client = APIClient()
        self.client.force_authenticate(self.renter)
        self.checkout_url = f'/api/rentals/{self.rental.id}/checkout'
        self.session = SimpleNamespace(
            id='cs_current', url='https://checkout.stripe.com/test', status='open',
            expires_at=int((timezone.now() + timedelta(minutes=31)).timestamp()),
        )

    def payment(self, session_id='cs_current'):
        return Payments.objects.create(rental=self.rental, session_id=session_id, amount='3024.00')

    @override_settings(STRIPE_SECRET_KEY='', STRIPE_WEBHOOK_SECRET='')
    @patch('payments.views.stripe.checkout.Session.create')
    def test_unconfigured_payments_return_clear_error_without_writes_or_provider_calls(self, create):
        response = self.client.post(self.checkout_url)
        self.assertEqual(response.status_code, 503, response.data)
        self.assertEqual(response.data['code'], 'payment_not_configured')
        create.assert_not_called()
        self.assertFalse(Payments.objects.exists())
        self.rental.refresh_from_db()
        self.assertEqual(self.rental.status, 'pending')

    @override_settings(STRIPE_SECRET_KEY='sk_test_placeholder', STRIPE_WEBHOOK_SECRET='')
    @patch('payments.views.stripe.checkout.Session.create')
    def test_checkout_cannot_collect_payment_without_webhook_configuration(self, create):
        self.assertEqual(self.client.post(self.checkout_url).status_code, 503)
        create.assert_not_called()
        self.assertFalse(Payments.objects.exists())

    @override_settings(STRIPE_SECRET_KEY='', STRIPE_WEBHOOK_SECRET='whsec_test')
    @patch('payments.views.stripe.Webhook.construct_event', return_value={'type': 'ignored.event'})
    def test_signed_webhook_verification_does_not_require_checkout_api_key(self, verify):
        response = self.client.post('/api/payments/webhook', {}, format='json')
        self.assertEqual(response.status_code, 200)
        verify.assert_called_once()

    @patch('payments.views._stripe')
    def test_expired_hold_is_revalidated_and_renewed_with_server_price(self, provider):
        self.assertFalse(tem_conflito(self.posting.id, self.rental.start_date, self.rental.end_date))
        provider.return_value.checkout.Session.create.return_value = self.session
        response = self.client.post(self.checkout_url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['amount'], '3024.00')
        self.rental.refresh_from_db()
        self.assertEqual(self.rental.total_price, Decimal('3024.00'))
        self.assertEqual(self.rental.status, 'awaiting_payment')
        self.assertGreater(self.rental.reservation_expires_at, timezone.now())
        self.assertTrue(tem_conflito(self.posting.id, self.rental.start_date, self.rental.end_date))
        kwargs = provider.return_value.checkout.Session.create.call_args.kwargs
        self.assertEqual(kwargs['line_items'][0]['price_data']['unit_amount'], 302400)
        self.assertIn('expires_at', kwargs)

    @patch('payments.views._stripe')
    def test_checkout_retry_reuses_open_session(self, provider):
        self.payment()
        provider.return_value.checkout.Session.retrieve.return_value = self.session
        response = self.client.post(self.checkout_url)
        self.assertEqual(response.status_code, 200, response.data)
        provider.return_value.checkout.Session.create.assert_not_called()
        self.assertEqual(Payments.objects.count(), 1)
        self.rental.refresh_from_db()
        self.assertGreater(self.rental.reservation_expires_at, timezone.now())

    @patch('payments.views._stripe')
    def test_other_tenants_and_anonymous_visitors_cannot_start_checkout(self, provider):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post(self.checkout_url).status_code, 404)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post(self.checkout_url).status_code, 401)
        provider.assert_not_called()

    @patch('payments.views._stripe')
    def test_occupied_dates_reject_checkout_before_contacting_stripe(self, provider):
        Rentals.objects.create(
            id=uuid.uuid4(), postings=self.posting, lessee=self.owner,
            start_date=self.rental.start_date, end_date=self.rental.end_date, status='active',
        )
        response = self.client.post(self.checkout_url)
        self.assertEqual(response.status_code, 409)
        provider.assert_not_called()
        self.assertFalse(Payments.objects.exists())

    @patch('payments.views._stripe')
    def test_paid_or_cancelled_reservations_cannot_be_charged_again(self, provider):
        for status in ('active', 'signed', 'completed', 'cancelled'):
            self.rental.status = status
            self.rental.save(update_fields=['status'])
            with self.subTest(status=status):
                self.assertEqual(self.client.post(self.checkout_url).status_code, 409)
        provider.assert_not_called()

    @patch('payments.views._stripe')
    def test_checkout_revalidates_changed_posting_limits(self, provider):
        for changes in (
            {'max_reservation_days': 1},
            {'availability_start': self.rental.start_date + timedelta(hours=1)},
            {'availability_end': self.rental.end_date - timedelta(hours=1)},
        ):
            with self.subTest(changes=changes):
                Postings.objects.filter(pk=self.posting.pk).update(
                    max_reservation_days=None, availability_start=None, availability_end=None,
                )
                Postings.objects.filter(pk=self.posting.pk).update(**changes)
                self.assertEqual(self.client.post(self.checkout_url).status_code, 409)
        provider.assert_not_called()

    def test_payment_status_is_private_to_the_tenant(self):
        self.payment()
        url = f'/api/rentals/{self.rental.id}/payment'
        self.assertEqual(self.client.get(url).status_code, 200)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(url).status_code, 404)

    @patch('payments.views._stripe')
    def test_reviewed_payment_cannot_be_charged_again(self, provider):
        payment = self.payment()
        payment.status = 'requires_review'
        payment.save(update_fields=['status'])
        self.assertEqual(self.client.post(self.checkout_url).status_code, 409)
        provider.assert_not_called()

    @override_settings(STRIPE_WEBHOOK_SECRET='whsec_test')
    @patch('payments.views._stripe')
    def test_delayed_payment_waits_for_paid_webhook(self, provider):
        payment = self.payment()
        def deliver(kind, payment_status):
            provider.return_value.Webhook.construct_event.return_value = {
                'type': kind, 'data': {'object': {'id': payment.session_id, 'payment_status': payment_status}},
            }
            self.assertEqual(self.client.post('/api/payments/webhook', {}, format='json').status_code, 200)
            payment.refresh_from_db()
            self.rental.refresh_from_db()
        deliver('checkout.session.completed', 'unpaid')
        self.assertEqual(payment.status, 'pending')
        self.assertEqual(self.rental.status, 'pending')
        deliver('checkout.session.async_payment_succeeded', 'paid')
        self.assertEqual(payment.status, 'approved')
        self.assertEqual(self.rental.status, 'active')
        deliver('checkout.session.completed', 'paid')
        self.assertEqual(payment.status, 'approved')

    @override_settings(STRIPE_WEBHOOK_SECRET='whsec_test')
    @patch('payments.views._stripe')
    def test_delayed_payment_failure_releases_the_reservation(self, provider):
        contract = Contracts.objects.create(id=uuid.uuid4(), rental=self.rental, status='pending_signatures')
        payment = self.payment()
        self.rental.status = 'awaiting_payment'
        self.rental.save(update_fields=['status'])
        provider.return_value.Webhook.construct_event.return_value = {
            'type': 'checkout.session.async_payment_failed', 'data': {'object': {'id': payment.session_id}},
        }
        self.assertEqual(self.client.post('/api/payments/webhook', {}, format='json').status_code, 200)
        payment.refresh_from_db()
        self.rental.refresh_from_db()
        self.assertEqual(payment.status, 'expired')
        self.assertEqual(self.rental.status, 'cancelled')
        contract.refresh_from_db()
        self.assertEqual(contract.status, 'cancelled')

    def test_approval_and_duplicate_events_preserve_confirmed_reservation(self):
        payment = self.payment()
        _aprovar(payment.session_id)
        _aprovar(payment.session_id)
        _expirar(payment.session_id)
        payment.refresh_from_db()
        self.rental.refresh_from_db()
        self.assertEqual(payment.status, 'approved')
        self.assertEqual(self.rental.status, 'active')

    def test_delayed_payment_cannot_confirm_overlapping_reservations(self):
        payment = self.payment()
        Rentals.objects.create(
            id=uuid.uuid4(), postings=self.posting, lessee=self.owner,
            start_date=self.rental.start_date, end_date=self.rental.end_date, status='active',
        )
        with self.assertLogs('payments.views', level='ERROR'):
            _aprovar(payment.session_id)
        payment.refresh_from_db()
        self.rental.refresh_from_db()
        self.assertEqual(payment.status, 'requires_review')
        self.assertEqual(self.rental.status, 'pending')

    def test_expiration_of_old_session_does_not_cancel_new_checkout(self):
        old = self.payment('cs_old')
        current = self.payment('cs_new')
        self.rental.status = 'awaiting_payment'
        self.rental.save(update_fields=['status'])
        _expirar(old.session_id)
        self.rental.refresh_from_db()
        self.assertEqual(self.rental.status, 'awaiting_payment')
        _expirar(current.session_id)
        self.rental.refresh_from_db()
        self.assertEqual(self.rental.status, 'cancelled')
