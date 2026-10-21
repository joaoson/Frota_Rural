"""Seed safety is verified on an isolated local test database, never Supabase."""
from datetime import date, timedelta
from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from django.db import connection
from django.test import TestCase
from django.utils import timezone

from rentals.models import Rentals
from reviews.models import Reviews
from chat.models import Messages
from contracts.models import Contracts, ContractSignatures
from document_validation.models import Certification
from machines.models import Machines
from notifications.models import Notification
from payments.models import Payments
from payments.pricing import calcular_total
from postings.models import Postings, PostingsPhotos
from seed import SeedConflict, seed_database, seed_id
from users.models import Users


class DevelopmentSeedTests(TestCase):
    def test_seed_creates_login_ready_demo_and_coherent_reservations(self):
        now = timezone.now()
        result = seed_database(allow_remote=True, now=now)
        self.assertEqual(result['created'], {
            'users': 6, 'certifications': 2, 'machines': 20, 'postings': 20,
            'rentals': 8, 'messages': 8, 'reviews': 4, 'contracts': 4,
            'notifications': 16,
        })
        self.assertTrue(Users.objects.get(email='joao.silva@example.test').check_password('Teste1234'))
        self.assertTrue(Users.objects.get(email='maria.oliveira@example.test').check_password('Teste1234'))
        self.assertFalse(Users.objects.filter(role='admin').exists())
        self.assertEqual(Users.objects.filter(role='operador', employer__role='locatario').count(), 2)
        for machine in Machines.objects.all():
            self.assertRegex(machine.renagro_number, r'^BR\d{10}$')
        for rental in Rentals.objects.select_related('postings'):
            self.assertEqual(rental.total_price, calcular_total(rental))
            self.assertEqual(rental.hourly_rate_snapshot, rental.postings.hourly_rate)
            self.assertLess(rental.start_date, rental.end_date)
            self.assertGreaterEqual(rental.start_date, rental.postings.availability_start)
            self.assertLessEqual(rental.end_date, rental.postings.availability_end)
            if rental.status == 'completed':
                self.assertLess(rental.end_date, now)
                self.assertGreater(rental.final_hour_meter, rental.initial_hour_meter)
            elif rental.status == 'pending':
                self.assertGreater(rental.start_date, now)
                self.assertEqual(rental.reservation_expires_at, now + timedelta(minutes=30))
                self.assertIsNone(rental.initial_hour_meter)
                self.assertFalse(rental.contracts.accepted_by_lessor)
                self.assertFalse(rental.contracts.accepted_by_lessee)
        for message in Messages.objects.select_related('rental__postings__machinery'):
            self.assertEqual(message.sender_id, message.rental.lessee_id)
            self.assertEqual(message.receiver_id, message.rental.postings.machinery.owner_id)
        self.assertEqual(Reviews.objects.exclude(rental__status='completed').count(), 0)
        self.assertEqual(Payments.objects.count(), 0)
        self.assertEqual(ContractSignatures.objects.count(), 0)
        self.assertEqual(PostingsPhotos.objects.count(), 0)

    def test_rerun_preserves_edits_password_expiry_and_notification_state(self):
        now = timezone.now()
        seed_database(allow_remote=True, now=now)
        user = Users.objects.get(pk=seed_id('user', 1))
        user.name = 'Demo editada pelo usuário'
        user.set_password('ChangedAfterSeed-123')
        user.save()
        rental = Rentals.objects.get(pk=seed_id('rental', 4))
        expiry, start = rental.reservation_expires_at, rental.start_date
        rental.status = 'cancelled'
        rental.save(update_fields=['status'])
        notification = Notification.objects.filter(recipient=user).first()
        notification.read_at = now
        notification.dismissed_at = now
        notification.save()
        result = seed_database(allow_remote=True, now=now + timedelta(days=2))
        self.assertEqual(sum(result['created'].values()), 0)
        self.assertEqual(sum(result['existing'].values()), 88)
        user.refresh_from_db()
        rental.refresh_from_db()
        notification.refresh_from_db()
        self.assertEqual(user.name, 'Demo editada pelo usuário')
        self.assertTrue(user.check_password('ChangedAfterSeed-123'))
        self.assertEqual(rental.status, 'cancelled')
        self.assertEqual(rental.reservation_expires_at, expiry)
        self.assertEqual(rental.start_date, start)
        self.assertEqual(notification.read_at, now)
        self.assertEqual(notification.dismissed_at, now)
        self.assertEqual(Notification.objects.count(), 16)

    def real_user(self, email='real.owner@example.test'):
        return Users.objects.create_user(email=email, password='ExistingRealPassword',
            name='Conta existente', document='REAL-123', role='locador',
            address='Endereço existente', birth_date=date(1980, 1, 1))

    def test_preexisting_unrelated_data_is_untouched(self):
        owner = self.real_user()
        machine = Machines.objects.create(id=seed_id('unrelated', 1), owner=owner,
            renagro_number='BR1111111111', brand='Máquina existente', hour_meter=99)
        original_user = Users.objects.filter(pk=owner.pk).values().get()
        original_machine = Machines.objects.filter(pk=machine.pk).values().get()
        seed_database(allow_remote=True)
        self.assertEqual(Users.objects.filter(pk=owner.pk).values().get(), original_user)
        self.assertEqual(Machines.objects.filter(pk=machine.pk).values().get(), original_machine)
        self.assertEqual(Users.objects.count(), 7)
        self.assertEqual(Machines.objects.count(), 21)
        self.assertFalse(Notification.objects.filter(recipient=owner).exists())

    def test_natural_key_collision_aborts_without_claiming_existing_account(self):
        owner = self.real_user('JOAO.SILVA@example.test')
        with self.assertRaises(SeedConflict):
            seed_database(allow_remote=True)
        self.assertEqual(Users.objects.count(), 1)
        self.assertTrue(Users.objects.get(pk=owner.pk).check_password('ExistingRealPassword'))
        self.assertFalse(Machines.objects.exists())
        self.assertFalse(Notification.objects.exists())

    def test_error_mid_seed_rolls_back_entire_fixture(self):
        with patch('seed.Messages.objects.create', side_effect=RuntimeError('forced failure')):
            with self.assertRaisesMessage(RuntimeError, 'forced failure'):
                seed_database(allow_remote=True)
        for model in (Users, Certification, Machines, Postings, Rentals, Contracts, Messages, Reviews, Notification):
            self.assertEqual(model.objects.count(), 0)

    def test_dry_run_is_read_only_and_predicts_counts(self):
        with patch('seed.make_password') as hash_password:
            preview = seed_database(dry_run=True)
        hash_password.assert_not_called()
        self.assertEqual(sum(preview['created'].values()), 88)
        self.assertFalse(Users.objects.exists())
        self.assertFalse(Notification.objects.exists())
        actual = seed_database(allow_remote=True)
        self.assertEqual(preview['created'], actual['created'])

    def test_remote_write_requires_explicit_flag_but_preview_is_allowed(self):
        with patch.dict(connection.settings_dict, {'HOST': 'project.supabase.co'}):
            with self.assertRaisesMessage(ImproperlyConfigured, '--allow-remote'):
                seed_database()
        self.assertFalse(Users.objects.exists())

    def test_demo_notifications_belong_only_to_rental_parties(self):
        seed_database(allow_remote=True)
        for notification in Notification.objects.select_related('rental__postings__machinery'):
            rental = notification.rental
            self.assertIn(notification.recipient_id, {rental.lessee_id, rental.postings.machinery.owner_id})
            self.assertTrue(notification.event_key.startswith('seed:demo:v1:'))
            self.assertEqual(notification.kind, 'rental')
            self.assertIsNone(notification.read_at)
            self.assertEqual(notification.posting_id, rental.postings_id)
