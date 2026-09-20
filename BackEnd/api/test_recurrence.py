import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from decimal import Decimal
from threading import Barrier
from unittest.mock import patch

from django.db import close_old_connections
from django.test import TestCase, TransactionTestCase, skipUnlessDBFeature
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import RentalRecurrence, Rentals
from contracts.models import Contracts
from machines.models import Machines
from payments.models import Payments
from postings.models import Postings
from users.models import Users


class RecurrenceFixtures:
    def setUp(self):
        self.owner = self.user('owner', 'locador')
        self.tenant = self.user('tenant', 'locatario')
        self.other = self.user('other', 'locatario')
        self.operator = self.user('operator', 'operador')
        self.machine = Machines.objects.create(
            id=uuid.uuid4(), owner=self.owner, brand='John Deere', model='6110J', status='active',
        )
        self.posting = Postings.objects.create(
            id=uuid.uuid4(), machinery=self.machine, hourly_rate='100.00', status='active',
        )
        self.first_day = timezone.localdate() + timedelta(days=40)
        now = timezone.now()
        self.source = Rentals.objects.create(
            id=uuid.uuid4(), postings=self.posting, lessee=self.tenant, operator=self.operator,
            start_date=self.at(timezone.localdate() - timedelta(days=30)),
            end_date=self.at(timezone.localdate() - timedelta(days=29), 18),
            total_price='50.00', status='completed', initial_hour_meter=10, final_hour_meter=30,
            created_at=now - timedelta(days=31), updated_at=now,
        )
        Contracts.objects.create(
            id=uuid.uuid4(), rental=self.source, status='signed', accepted_by_lessor=True,
            accepted_by_lessee=True, created_at=now,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.tenant)
        self.preview_url = f'/api/rentals/{self.source.pk}/recurrence/preview'
        self.create_url = f'/api/rentals/{self.source.pk}/recurrence'
        self.payload = {'first_start_date': str(self.first_day), 'frequency': 'weekly', 'occurrences': 2}

    @staticmethod
    def user(name, role):
        return Users.objects.create(
            name=name, document=name, email=f'{name}@recurrence.test', role=role,
            address='Test street', birth_date=date(1990, 1, 1),
        )

    @staticmethod
    def at(day, hour=8):
        return timezone.make_aware(datetime.combine(day, datetime.min.time()).replace(hour=hour))

    def create(self, **overrides):
        return self.client.post(self.create_url, {
            **self.payload, 'idempotency_key': str(uuid.uuid4()), **overrides,
        }, format='json')

    def conflict(self, day=None, status='active', age=0):
        day = day or self.first_day
        return Rentals.objects.create(
            id=uuid.uuid4(), postings=self.posting, lessee=self.other,
            start_date=self.at(day), end_date=self.at(day, 18), status=status,
            created_at=timezone.now() - timedelta(minutes=age),
        )


class RentalRecurrenceTests(RecurrenceFixtures, TestCase):
    def test_preview_reuses_duration_and_current_server_price_without_writes(self):
        response = self.client.post(self.preview_url, self.payload, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['total_price'], '3360.00')
        self.assertEqual(len(response.data['dates']), 2)
        self.assertEqual(response.data['dates'][0]['total_price'], '1680.00')
        for row in response.data['dates']:
            self.assertEqual(row['end_date'] - row['start_date'], self.source.end_date - self.source.start_date)
        self.assertEqual(Rentals.objects.count(), 1)
        self.assertEqual(RentalRecurrence.objects.count(), 0)

    def test_create_new_rentals_and_unsigned_contracts_without_copying_payment_or_meters(self):
        response = self.create()
        self.assertEqual(response.status_code, 201, response.data)
        series = RentalRecurrence.objects.get()
        self.assertEqual(series.source_rental, self.source)
        self.assertEqual(series.total_price, Decimal('3360.00'))
        self.assertEqual(len(response.data['rentals']), 2)
        self.assertIn('reservation_expires_at', response.data)
        for index, rental in enumerate(series.rentals.order_by('recurrence_index'), start=1):
            self.assertEqual(rental.lessee, self.tenant)
            self.assertEqual(rental.operator, self.operator)
            self.assertEqual(rental.status, 'pending')
            self.assertGreater(rental.reservation_expires_at, timezone.now() + timedelta(minutes=29))
            self.assertEqual(rental.recurrence_index, index)
            self.assertEqual(rental.total_price, Decimal('1680.00'))
            self.assertIsNone(rental.initial_hour_meter)
            self.assertIsNone(rental.final_hour_meter)
            self.assertFalse(rental.contracts.accepted_by_lessor)
            self.assertFalse(rental.contracts.accepted_by_lessee)
            self.assertEqual(rental.contracts.status, 'pending_signatures')
            self.assertEqual(rental.contracts.signatures.count(), 0)
        self.assertEqual(Payments.objects.count(), 0)
        self.source.refresh_from_db()
        self.assertEqual(self.source.total_price, Decimal('50.00'))
        self.assertEqual(self.source.status, 'completed')
        self.assertEqual(self.source.initial_hour_meter, 10)
        self.assertTrue(self.source.contracts.accepted_by_lessor)

    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post(self.preview_url, self.payload, format='json').status_code, 401)
        self.assertEqual(self.create().status_code, 401)

    def test_only_source_tenant_can_preview_or_create(self):
        for user in (self.owner, self.other):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.post(self.preview_url, self.payload, format='json').status_code, 404)
            self.assertEqual(self.create().status_code, 404)
        self.assertEqual(RentalRecurrence.objects.count(), 0)

    def test_rejects_client_controlled_price_status_lessee_and_equipment(self):
        for field, value in [('total_price', '0.01'), ('status', 'active'), ('lessee', str(self.other.pk)),
                             ('postings', str(self.posting.pk)), ('operator', str(self.other.pk))]:
            response = self.create(**{field: value})
            self.assertEqual(response.status_code, 400, response.data)
            self.assertIn(field, response.data)
        self.assertEqual(RentalRecurrence.objects.count(), 0)

    def test_validates_required_dates_frequency_count_and_key(self):
        for data in [{'first_start_date': str(timezone.localdate())},
                     {'first_start_date': str(timezone.localdate() - timedelta(days=1))},
                     {'frequency': 'daily'}, {'occurrences': 1}, {'occurrences': 13},
                     {'occurrences': 2.5}, {'idempotency_key': 'bad'}]:
            self.assertEqual(self.create(**data).status_code, 400, data)
        response = self.client.post(self.create_url, self.payload, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('idempotency_key', response.data)

    def test_monthly_dates_anchor_to_first_day_including_leap_year(self):
        for year, feb_day in [(2031, 28), (2032, 29)]:
            with self.subTest(year=year):
                response = self.client.post(self.preview_url, {
                    **self.payload, 'first_start_date': f'{year}-01-31', 'frequency': 'monthly', 'occurrences': 3,
                }, format='json')
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual([r['start_date'].date() for r in response.data['dates']],
                                 [date(year, 1, 31), date(year, 2, feb_day), date(year, 3, 31)])

    def test_biweekly_dates_cross_year_without_drifting(self):
        response = self.client.post(self.preview_url, {
            **self.payload, 'first_start_date': '2030-12-25', 'frequency': 'biweekly', 'occurrences': 3,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([r['start_date'].date() for r in response.data['dates']],
                         [date(2030, 12, 25), date(2031, 1, 8), date(2031, 1, 22)])

    def test_invalid_far_future_calendar_returns_validation_error(self):
        response = self.create(first_start_date='9999-12-25', occurrences=3)
        self.assertEqual(response.status_code, 400)

    def test_one_conflict_prevents_every_reservation(self):
        conflict = self.conflict(day=self.first_day + timedelta(days=7))
        response = self.create()
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(set(Rentals.objects.values_list('pk', flat=True)), {self.source.pk, conflict.pk})
        self.assertEqual(RentalRecurrence.objects.count(), 0)
        self.assertEqual(Contracts.objects.count(), 1)

    def test_contract_failure_rolls_back_entire_series(self):
        original = Contracts.objects.create
        calls = 0

        def fail_second(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError('simulated database failure')
            return original(*args, **kwargs)

        with patch('api.recurrence.Contracts.objects.create', side_effect=fail_second):
            with self.assertRaises(RuntimeError):
                self.create()
        self.assertEqual(Rentals.objects.count(), 1)
        self.assertEqual(RentalRecurrence.objects.count(), 0)
        self.assertEqual(Contracts.objects.count(), 1)

    def test_cleaning_buffer_blocks_adjacent_reservation(self):
        self.conflict(day=self.first_day - timedelta(days=1))
        self.assertEqual(self.create().status_code, 409)

    def test_other_listing_of_same_machine_blocks_series_and_public_calendar(self):
        other_posting = Postings.objects.create(
            id=uuid.uuid4(), machinery=self.machine, hourly_rate='150.00', status='active',
        )
        conflict = self.conflict()
        conflict.postings = other_posting
        conflict.save()
        self.assertEqual(self.create().status_code, 409)
        response = self.client.get(f'/api/postings/{self.posting.pk}/ocupacao')
        self.assertIn(str(conflict.pk), [str(row['id']) for row in response.data['ocupados']])

    def test_self_overlap_includes_cleaning_interval(self):
        self.source.end_date = self.source.start_date + timedelta(days=6)
        self.source.save()
        response = self.create()
        self.assertEqual(response.status_code, 400)
        self.assertIn('frequency', response.data)

    def test_current_occupied_statuses_block_series(self):
        for status in ['active', 'signed', 'completed', 'closed', 'pending', 'awaiting_payment']:
            with self.subTest(status=status):
                rental = self.conflict(status=status)
                self.assertEqual(self.create().status_code, 409)
                rental.delete()

    def test_expired_temporary_holds_and_cancelled_rentals_do_not_block(self):
        self.conflict(status='pending', age=31)
        self.conflict(day=self.first_day + timedelta(days=7), status='awaiting_payment', age=31)
        self.conflict(status='cancelled')
        response = self.create()
        self.assertEqual(response.status_code, 201, response.data)

    def test_explicit_hold_expiry_overrides_legacy_creation_time(self):
        rental = self.conflict(status='awaiting_payment', age=60)
        rental.reservation_expires_at = timezone.now() + timedelta(minutes=20)
        rental.save()
        self.assertEqual(self.create().status_code, 409)
        rental.created_at = timezone.now()
        rental.reservation_expires_at = timezone.now() - timedelta(seconds=1)
        rental.save()
        self.assertEqual(self.create().status_code, 201)

    def test_maximum_duration_and_posting_availability_are_enforced(self):
        self.posting.max_reservation_days = 1
        self.posting.save()
        self.assertEqual(self.create().status_code, 400)
        self.posting.max_reservation_days = 2
        self.posting.availability_start = self.at(self.first_day + timedelta(days=1))
        self.posting.save()
        self.assertEqual(self.create().status_code, 409)
        self.posting.availability_start = None
        self.posting.availability_end = self.at(self.first_day + timedelta(days=7))
        self.posting.save()
        self.assertEqual(self.create().status_code, 409)

    def test_inactive_posting_or_machine_rejected(self):
        self.posting.status = 'inactive'
        self.posting.save()
        self.assertEqual(self.create().status_code, 400)
        self.posting.status = 'active'
        self.posting.save()
        self.machine.status = 'maintenance'
        self.machine.save()
        self.assertEqual(self.create().status_code, 400)

    def test_inactive_source_operator_rejected(self):
        self.operator.status = 'inactive'
        self.operator.save()
        self.assertEqual(self.create().status_code, 400)

    def test_idempotent_replay_returns_original_after_price_and_availability_change(self):
        key = str(uuid.uuid4())
        original = self.create(idempotency_key=key)
        self.posting.hourly_rate = Decimal('999.00')
        self.posting.status = 'inactive'
        self.posting.save()
        response = self.create(idempotency_key=key)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data, original.data)
        self.assertEqual(RentalRecurrence.objects.count(), 1)
        self.assertEqual(Rentals.objects.count(), 3)

    def test_idempotency_key_cannot_be_reused_for_different_payload(self):
        key = str(uuid.uuid4())
        self.assertEqual(self.create(idempotency_key=key).status_code, 201)
        self.assertEqual(self.create(idempotency_key=key, occurrences=3).status_code, 409)
        self.assertEqual(RentalRecurrence.objects.count(), 1)

    def test_price_changes_between_preview_and_create_are_recalculated(self):
        self.client.post(self.preview_url, self.payload, format='json')
        self.posting.hourly_rate = Decimal('200.00')
        self.posting.save()
        response = self.create()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['total_price'], '6720.00')

    def test_nonpositive_or_overflowing_price_rejected(self):
        for price in ['0.00', '-1.00', '99999999.99']:
            self.posting.hourly_rate = Decimal(price)
            self.posting.save()
            self.assertEqual(self.create().status_code, 400)

    def test_single_booking_and_recurrence_share_expired_hold_and_buffer_rules(self):
        self.conflict(status='pending', age=31)
        response = self.client.post('/api/rentals/', {
            'postings': str(self.posting.pk), 'lessee': str(self.tenant.pk),
            'start_date': self.at(self.first_day).isoformat(),
            'end_date': self.at(self.first_day, 18).isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.create().status_code, 409)


@skipUnlessDBFeature('has_select_for_update')
class RentalRecurrenceConcurrencyTests(RecurrenceFixtures, TransactionTestCase):
    def concurrent_requests(self, requests):
        barrier = Barrier(len(requests))

        def submit(item):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(item[2] if len(item) > 2 else self.tenant)
                barrier.wait(timeout=10)
                return client.post(item[0], item[1], format='json').status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=len(requests)) as pool:
            return list(pool.map(submit, requests))

    def test_parallel_series_for_same_dates_create_only_one_batch(self):
        requests = [(self.create_url, {**self.payload, 'idempotency_key': str(uuid.uuid4())}) for _ in range(2)]
        statuses = self.concurrent_requests(requests)
        self.assertEqual(sorted(statuses), [201, 409])
        self.assertEqual(RentalRecurrence.objects.count(), 1)
        self.assertEqual(Rentals.objects.count(), 3)

    def test_parallel_idempotent_requests_return_one_batch_twice(self):
        request = (self.create_url, {**self.payload, 'idempotency_key': str(uuid.uuid4())})
        self.assertEqual(self.concurrent_requests([request, request]), [201, 201])
        self.assertEqual(RentalRecurrence.objects.count(), 1)
        self.assertEqual(Rentals.objects.count(), 3)

    def test_parallel_series_across_listings_and_tenants_lock_the_shared_machine(self):
        other_posting = Postings.objects.create(
            id=uuid.uuid4(), machinery=self.machine, hourly_rate='150.00', status='active',
        )
        other_source = Rentals.objects.create(
            id=uuid.uuid4(), postings=other_posting, lessee=self.other,
            start_date=self.source.start_date, end_date=self.source.end_date,
            status='completed', created_at=self.source.created_at,
        )
        statuses = self.concurrent_requests([
            (self.create_url, {**self.payload, 'idempotency_key': str(uuid.uuid4())}, self.tenant),
            (f'/api/rentals/{other_source.pk}/recurrence',
             {**self.payload, 'idempotency_key': str(uuid.uuid4())}, self.other),
        ])
        self.assertEqual(sorted(statuses), [201, 409])
        self.assertEqual(RentalRecurrence.objects.count(), 1)
        self.assertEqual(Rentals.objects.filter(start_date=self.at(self.first_day)).count(), 1)

    def test_single_booking_cannot_race_past_series_availability_check(self):
        statuses = self.concurrent_requests([
            (self.create_url, {**self.payload, 'idempotency_key': str(uuid.uuid4())}),
            ('/api/rentals/', {
                'postings': str(self.posting.pk), 'lessee': str(self.tenant.pk),
                'start_date': self.at(self.first_day).isoformat(),
                'end_date': self.at(self.first_day, 18).isoformat(),
            }),
        ])
        self.assertEqual(statuses.count(201), 1, statuses)
        self.assertTrue(400 in statuses or 409 in statuses, statuses)
        self.assertEqual(Rentals.objects.filter(start_date=self.at(self.first_day)).count(), 1)
