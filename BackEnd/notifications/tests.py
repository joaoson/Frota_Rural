import uuid
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from django.db import transaction
from django.test import TestCase, override_settings
from django.utils import timezone

from api.models import RentalRecurrence
from rentals.models import Rentals
from api.test_recurrence import RecurrenceFixtures
from contracts.models import Contracts, ContractSignatures
from payments.models import Payments
from payments.services import PaymentService

from .events import notify_rental_event
from .models import Notification


class NotificationFixtures(RecurrenceFixtures):
    def notice(self, event='rental_created', key=None, rental=None):
        return notify_rental_event(rental or self.source, event, event_key=key or str(uuid.uuid4()))

    def new_rental(self):
        response = self.client.post('/api/rentals/', {
            'postings': str(self.posting.pk), 'lessee': str(self.tenant.pk),
            'start_date': self.at(self.first_day).isoformat(),
            'end_date': self.at(self.first_day + timedelta(days=1), 18).isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return Rentals.objects.get(pk=response.data['id'])


class NotificationInboxTests(NotificationFixtures, TestCase):
    def test_all_endpoints_require_authentication(self):
        notice = self.notice()[0]
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/notifications/').status_code, 401)
        self.assertEqual(self.client.patch(f'/api/notifications/{notice.pk}', {'is_read': True}, format='json').status_code, 401)
        self.assertEqual(self.client.delete(f'/api/notifications/{notice.pk}').status_code, 401)
        self.assertEqual(self.client.post('/api/notifications/read-all').status_code, 401)

    def test_recipient_scope_and_private_fields(self):
        self.notice(key='created')
        response = self.client.get('/api/notifications/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        row = response.data['results'][0]
        self.assertEqual(str(row['rental']), str(self.source.pk))
        self.assertEqual(str(row['posting']), str(self.posting.pk))
        self.assertEqual(str(row['contract']), str(self.source.contracts.pk))
        self.assertNotIn('recipient', row)
        self.assertNotIn('event_key', row)
        self.assertFalse(row['is_read'])
        owner_notice = Notification.objects.get(recipient=self.owner)
        self.assertEqual(self.client.patch(f'/api/notifications/{owner_notice.pk}', {'is_read': True}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(f'/api/notifications/{owner_notice.pk}').status_code, 404)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get('/api/notifications/').data['count'], 0)

    def test_pagination_kind_and_unread_filters_keep_global_unread_count(self):
        self.notice('rental_created')
        self.notice('payment_approved')
        self.notice('contract_completed')
        newest = Notification.objects.filter(recipient=self.tenant).first()
        newest.read_at = timezone.now()
        newest.save()
        response = self.client.get('/api/notifications/?limit=1&offset=1')
        self.assertEqual(response.data['count'], 3)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['kind'], 'payment')
        response = self.client.get('/api/notifications/?kind=contract&unread=false')
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['unread_count'], 2)
        self.assertEqual(self.client.get('/api/notifications/?unread=true').data['count'], 2)
        self.assertEqual(self.client.get('/api/notifications/?offset=100').data['results'], [])

    def test_bad_query_parameters_return_validation_errors(self):
        for query in ['limit=0', 'limit=101', 'limit=no', 'limit=1.5', 'offset=-1',
                      'offset=xyz', 'offset=1000001', 'kind=unknown', 'unread=maybe', 'unread=1']:
            with self.subTest(query=query):
                self.assertEqual(self.client.get(f'/api/notifications/?{query}').status_code, 400)

    def test_read_toggle_is_persistent_and_repeat_preserves_timestamp(self):
        self.notice()
        notice = Notification.objects.get(recipient=self.tenant)
        url = f'/api/notifications/{notice.pk}'
        response = self.client.patch(url, {'is_read': True}, format='json')
        self.assertTrue(response.data['is_read'])
        read_at = response.data['read_at']
        self.assertEqual(self.client.patch(url, {'is_read': True}, format='json').data['read_at'], read_at)
        self.assertEqual(self.client.get('/api/notifications/').data['unread_count'], 0)
        response = self.client.patch(url, {'is_read': False}, format='json')
        self.assertFalse(response.data['is_read'])
        self.assertIsNone(response.data['read_at'])
        self.assertEqual(self.client.get('/api/notifications/').data['unread_count'], 1)

    def test_read_update_cannot_reassign_notification_or_accept_non_boolean(self):
        self.notice()
        notice = Notification.objects.get(recipient=self.tenant)
        for payload in [{}, {'is_read': 'false'}, {'is_read': None}, {'is_read': 1},
                        {'is_read': True, 'recipient': str(self.other.pk)}, {'title': 'tampered'}]:
            with self.subTest(payload=payload):
                self.assertEqual(self.client.patch(f'/api/notifications/{notice.pk}', payload, format='json').status_code, 400)
        notice.refresh_from_db()
        self.assertIsNone(notice.read_at)

    def test_read_all_changes_only_own_visible_inbox(self):
        self.notice(key='one')
        self.notice(key='two')
        dismissed = Notification.objects.get(recipient=self.tenant, event_key='one')
        self.client.delete(f'/api/notifications/{dismissed.pk}')
        response = self.client.post('/api/notifications/read-all')
        self.assertEqual(response.data, {'updated': 1, 'unread_count': 0})
        self.assertEqual(Notification.objects.filter(recipient=self.owner, read_at__isnull=True).count(), 2)
        dismissed.refresh_from_db()
        self.assertIsNone(dismissed.read_at)
        self.assertEqual(self.client.post('/api/notifications/read-all').data['updated'], 0)

    def test_dismiss_is_soft_idempotent_and_event_retry_cannot_resurrect_it(self):
        self.notice(key='durable-event')
        notice = Notification.objects.get(recipient=self.tenant)
        url = f'/api/notifications/{notice.pk}'
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.notice(key='durable-event')
        self.assertEqual(Notification.objects.count(), 2)
        self.assertEqual(self.client.get('/api/notifications/').data['count'], 0)
        self.assertEqual(self.client.get('/api/notifications/').data['unread_count'], 0)
        self.assertEqual(self.client.patch(url, {'is_read': False}, format='json').status_code, 404)

    def test_event_helper_participates_in_callers_transaction(self):
        with self.assertRaises(RuntimeError):
            with transaction.atomic():
                self.notice(key='rolled-back')
                raise RuntimeError('cancel business transaction')
        self.assertEqual(Notification.objects.count(), 0)


class RentalNotificationTests(NotificationFixtures, TestCase):
    def test_single_reservation_notifies_only_both_parties_with_contract_reference(self):
        rental = self.new_rental()
        notifications = Notification.objects.filter(rental=rental)
        self.assertEqual(set(notifications.values_list('recipient_id', flat=True)), {self.tenant.pk, self.owner.pk})
        self.assertEqual(set(notifications.values_list('contract_id', flat=True)), {rental.contracts.pk})
        self.assertEqual(set(notifications.values_list('title', flat=True)), {'Reserva criada'})
        self.assertFalse(Notification.objects.filter(recipient=self.operator).exists())

    def test_failed_notification_rolls_back_reservation_and_contract(self):
        def fail_after_write(*args, **kwargs):
            notify_rental_event(*args, **kwargs)
            raise RuntimeError('notification write failed')
        with patch('rentals.services.notify_rental_event', side_effect=fail_after_write):
            with self.assertRaises(RuntimeError):
                self.new_rental()
        self.assertEqual(Rentals.objects.count(), 1)
        self.assertEqual(Contracts.objects.count(), 1)
        self.assertEqual(Notification.objects.count(), 0)

    def test_recurrence_retry_and_dismiss_preserve_exactly_one_event_per_new_reservation(self):
        key = str(uuid.uuid4())
        response = self.create(idempotency_key=key)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Notification.objects.count(), 4)
        notice = Notification.objects.filter(recipient=self.tenant).first()
        self.client.delete(f'/api/notifications/{notice.pk}')
        self.assertEqual(self.create(idempotency_key=key).status_code, 201)
        self.assertEqual(Notification.objects.count(), 4)
        self.assertEqual(self.client.get('/api/notifications/').data['count'], 1)
        self.assertFalse(Notification.objects.filter(rental=self.source).exists())

    def test_partial_recurrence_failure_rolls_back_all_events_and_reservations(self):
        calls = 0
        def fail_second(*args, **kwargs):
            nonlocal calls
            calls += 1
            notify_rental_event(*args, **kwargs)
            if calls == 2:
                raise RuntimeError('second occurrence failed')
        with patch('api.recurrence.notify_rental_event', side_effect=fail_second):
            with self.assertRaises(RuntimeError):
                self.create()
        self.assertEqual(Notification.objects.count(), 0)
        self.assertEqual(RentalRecurrence.objects.count(), 0)
        self.assertEqual(Rentals.objects.count(), 1)

    def test_date_update_and_cancellation_emit_events_without_noop_duplicates(self):
        rental = self.new_rental()
        url = f'/api/rentals/{rental.pk}'
        data = {'end_date': self.at(self.first_day + timedelta(days=2), 18).isoformat()}
        self.assertEqual(self.client.patch(url, data, format='json').status_code, 200)
        self.assertEqual(Notification.objects.filter(title='Locação atualizada').count(), 2)
        self.assertEqual(self.client.patch(url, data, format='json').status_code, 200)
        self.assertEqual(Notification.objects.filter(title='Locação atualizada').count(), 2)
        self.assertEqual(self.client.patch(url, {'status': 'cancelled'}, format='json').status_code, 200)
        self.assertEqual(self.client.patch(url, {'status': 'cancelled'}, format='json').status_code, 200)
        self.assertEqual(Notification.objects.filter(title='Reserva cancelada').count(), 2)

    def test_lessor_completion_notifies_both_parties(self):
        # Completion requires both signatures (ADR 0002); the fixture contract is signed.
        self.source.status = 'signed'
        self.source.save(update_fields=['status'])
        self.client.force_authenticate(self.owner)
        response = self.client.patch(f'/api/rentals/{self.source.pk}', {'status': 'completed'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Notification.objects.filter(title='Locação concluída').count(), 2)


class PaymentAndContractNotificationTests(NotificationFixtures, TestCase):
    def setUp(self):
        super().setUp()
        self.rental = self.new_rental()

    def payment(self, session_id='cs_notifications'):
        return Payments.objects.create(rental=self.rental, session_id=session_id, amount=self.rental.total_price)

    @patch('payments.services._stripe')
    def test_checkout_and_retry_emit_one_pending_event_per_party(self, provider):
        session = SimpleNamespace(id='cs_pending', url='https://checkout.stripe.com/test', status='open',
                                  expires_at=int((timezone.now() + timedelta(minutes=31)).timestamp()))
        provider.return_value.checkout.Session.create.return_value = session
        provider.return_value.checkout.Session.retrieve.return_value = session
        url = f'/api/rentals/{self.rental.pk}/checkout'
        self.assertEqual(self.client.post(url).status_code, 200)
        self.assertEqual(self.client.post(url).status_code, 200)
        self.assertEqual(Notification.objects.filter(kind='payment').count(), 2)

    def test_approval_replay_and_expiry_do_not_duplicate_or_contradict_confirmation(self):
        payment = self.payment()
        PaymentService._approve(payment.session_id)
        PaymentService._approve(payment.session_id)
        PaymentService._expire(payment.session_id)
        self.assertEqual(Notification.objects.filter(kind='payment').count(), 2)
        self.assertEqual(Notification.objects.filter(title='Pagamento confirmado').count(), 2)

    def test_expiry_replay_emits_payment_and_cancellation_once(self):
        payment = self.payment()
        self.rental.status = 'awaiting_payment'
        self.rental.save(update_fields=['status'])
        PaymentService._expire(payment.session_id)
        PaymentService._expire(payment.session_id)
        self.assertEqual(Notification.objects.filter(title='Prazo de pagamento encerrado').count(), 2)
        self.assertEqual(Notification.objects.filter(title='Reserva cancelada').count(), 2)

    def test_late_conflicting_payment_notifies_review_without_confirmation(self):
        payment = self.payment()
        self.conflict()
        with self.assertLogs('payments.services', level='ERROR'):
            PaymentService._approve(payment.session_id)
        PaymentService._approve(payment.session_id)
        self.assertEqual(Notification.objects.filter(title='Pagamento em análise').count(), 2)
        self.assertFalse(Notification.objects.filter(title='Pagamento confirmado').exists())

    def test_notification_failure_rolls_back_payment_approval(self):
        payment = self.payment()
        with patch('payments.services.notify_rental_event', side_effect=RuntimeError('failed event')):
            with self.assertRaises(RuntimeError):
                PaymentService._approve(payment.session_id)
        payment.refresh_from_db()
        self.rental.refresh_from_db()
        self.assertEqual(payment.status, 'pending')
        self.assertEqual(self.rental.status, 'pending')
        self.assertFalse(Notification.objects.filter(kind='payment').exists())

    @override_settings(CONTRACT_SIGNATURE_REQUIRE_OTP=False)
    def test_both_signatures_and_completion_notify_once_with_duplicate_rejected(self):
        payment = self.payment()
        PaymentService._approve(payment.session_id)
        url = f'/api/contracts/{self.rental.pk}/sign'
        response = self.client.post(url, {'role': 'locatario'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Notification.objects.filter(kind='contract').count(), 2)
        self.client.force_authenticate(self.owner)
        response = self.client.post(url, {'role': 'locador'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Notification.objects.filter(kind='contract').count(), 6)
        self.assertEqual(Notification.objects.filter(title='Contrato assinado pelas duas partes').count(), 2)
        self.assertEqual(self.client.post(url, {'role': 'locador'}, format='json').status_code, 409)
        self.assertEqual(Notification.objects.filter(kind='contract').count(), 6)
        self.assertEqual(ContractSignatures.objects.count(), 2)

    @override_settings(CONTRACT_SIGNATURE_REQUIRE_OTP=False)
    def test_unpaid_or_unauthorized_signing_produces_no_notification(self):
        url = f'/api/contracts/{self.rental.pk}/sign'
        self.assertEqual(self.client.post(url, {'role': 'locatario'}, format='json').status_code, 409)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(url, {'role': 'locatario'}, format='json').status_code, 404)
        self.assertFalse(Notification.objects.filter(kind='contract').exists())
