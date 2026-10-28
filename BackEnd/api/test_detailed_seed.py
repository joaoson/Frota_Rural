"""Rich demo inventory: coherent fixtures, safe upgrades and no external providers."""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone

from chat.models import Messages
from contracts.models import Contracts, ContractSignatures
from demo_seed import catalog
from machines.models import Machines
from notifications.models import Notification
from payments.models import Payments
from payments.pricing import calcular_total
from postings.models import Postings, PostingsPhotos
from rentals.models import RentalMeterReadings, Rentals
from reviews.models import Reviews
from seed import SeedConflict, seed_database, seed_id
from users.models import Users

ASSETS = 'http://localhost:5175/demo'


class DetailedSeedTests(TestCase):
    def populate(self, **kwargs):
        return seed_database(allow_remote=True, asset_base_url=ASSETS, **kwargs)

    def test_inventory_has_real_asset_references_and_coherent_detailed_rentals(self):
        now = timezone.now()
        with patch('djangoapi.firebase_storage.upload_image') as upload:
            result = self.populate(now=now)
        upload.assert_not_called()
        self.assertEqual(result['created'], {
            'users': 7, 'certifications': 2, 'machines': 20, 'postings': 20,
            'rentals': 32, 'contracts': 16, 'messages': 104, 'reviews': 28,
            'postings_photos': 37, 'rental_meter_readings': 24, 'notifications': 64,
        })
        self.assertEqual(Users.objects.exclude(profile_photo__isnull=True).count(), 6)
        for photo in PostingsPhotos.objects.all():
            self.assertTrue(photo.image_url.startswith(f'{ASSETS}/machines/'))
        for posting in Postings.objects.all():
            self.assertEqual(posting.postingsphotos_set.filter(is_primary=True).count(), 1)
            self.assertIn('ANÚNCIO FICTÍCIO', posting.description)
            self.assertIn('credits.html#machine-', posting.description)
            self.assertGreater(len(posting.machinery.technical_specifications), 500)
        for rental in Rentals.objects.select_related('postings', 'operator'):
            self.assertEqual(rental.total_price, calcular_total(rental))
            self.assertLess(rental.start_date, rental.end_date)
            self.assertGreaterEqual(rental.start_date, rental.postings.availability_start)
            self.assertLessEqual(rental.end_date, rental.postings.availability_end)
            self.assertGreater(len(rental.notes), 300)
            self.assertEqual(rental.operator.employer_id, rental.lessee_id)
        for i in range(24):
            rental = Rentals.objects.get(pk=seed_id('detailed-rental', i))
            self.assertEqual(rental.messages_set.count(), 4)
            for message in rental.messages_set.all():
                self.assertEqual({message.sender_id, message.receiver_id},
                    {rental.lessee_id, rental.postings.machinery.owner_id})
                self.assertLessEqual(message.sent_at, now)
            if i < 12:
                readings = list(rental.meter_readings.order_by('recorded_at'))
                self.assertEqual([r.kind for r in readings], ['check_in', 'check_out'])
                self.assertEqual([r.value for r in readings], [rental.initial_hour_meter, rental.final_hour_meter])
                self.assertEqual(rental.reviews_set.count(), 2)
                self.assertLess(rental.end_date, now)
            elif i >= 20:
                self.assertTrue(rental.cancellation_reason.startswith('DEMONSTRAÇÃO'))
                self.assertLess(rental.cancelled_at, now)
                self.assertEqual(rental.contracts.status, 'cancelled')
            else:
                self.assertGreater(rental.start_date, now)
                self.assertEqual(rental.reservation_expires_at, now + timedelta(minutes=30))
        self.assertFalse(Payments.objects.exists())
        self.assertFalse(ContractSignatures.objects.exists())

    def test_preview_is_read_only_and_rerun_is_idempotent(self):
        now = timezone.now()
        preview = self.populate(dry_run=True, enrich_demo=True, now=now)
        self.assertEqual(sum(preview['created'].values()), 354)
        self.assertFalse(Users.objects.exists())
        actual = self.populate(enrich_demo=True, now=now)
        self.assertEqual(preview, {**actual, 'dry_run': True})
        snapshot = {model: list(model.objects.order_by('pk').values()) for model in
            (Users, Machines, Postings, PostingsPhotos, Rentals, RentalMeterReadings, Messages, Reviews, Contracts, Notification)}
        rerun = self.populate(enrich_demo=True, now=now + timedelta(days=1))
        self.assertEqual(rerun['created'], {})
        self.assertEqual(rerun['enriched'], {})
        self.assertEqual(sum(rerun['existing'].values()), 354)
        for model, rows in snapshot.items():
            self.assertEqual(list(model.objects.order_by('pk').values()), rows)

    def test_upgrade_only_enriches_empty_or_original_demo_fields(self):
        self.populate(detailed=False)
        user = Users.objects.get(pk=seed_id('user', 0))
        user.profile_photo = 'https://example.test/my-personal-photo.jpg'
        user.address = 'Meu endereço editado'
        user.set_password('Preserve-my-password-123')
        user.save()
        posting = Postings.objects.get(pk=seed_id('posting', 0))
        posting.description = 'Texto escrito pelo dono da máquina'
        posting.hourly_rate = Decimal('222.00')
        posting.save()
        machine = posting.machinery
        machine.technical_specifications = 'Configuração personalizada'
        machine.save()
        rental = Rentals.objects.get(pk=seed_id('rental', 0))
        rental.notes = 'Observação editada pelo usuário'
        rental.save()
        snapshots = {model: list(model.objects.order_by('pk').values()) for model in
            (Users, Machines, Postings, Rentals)}
        preview = self.populate(dry_run=True, enrich_demo=True)
        self.assertEqual(preview['enriched'], {'users': 5, 'machines': 19, 'postings': 19, 'rentals': 7})
        for model, rows in snapshots.items():
            self.assertEqual(list(model.objects.order_by('pk').values()), rows)
        self.populate(enrich_demo=True)
        user.refresh_from_db(); posting.refresh_from_db(); machine.refresh_from_db(); rental.refresh_from_db()
        self.assertEqual(user.profile_photo, 'https://example.test/my-personal-photo.jpg')
        self.assertEqual(user.address, 'Meu endereço editado')
        self.assertTrue(user.check_password('Preserve-my-password-123'))
        self.assertEqual(posting.description, 'Texto escrito pelo dono da máquina')
        self.assertEqual(posting.hourly_rate, Decimal('222.00'))
        self.assertEqual(machine.technical_specifications, 'Configuração personalizada')
        self.assertEqual(rental.notes, 'Observação editada pelo usuário')
        self.assertTrue(Users.objects.get(pk=seed_id('user', 1)).profile_photo.startswith(ASSETS))

    def test_existing_photo_remains_the_cover_and_basic_records_need_opt_in_to_enrich(self):
        self.populate(detailed=False)
        posting = Postings.objects.get(pk=seed_id('posting', 0))
        original_description = posting.description
        photo = PostingsPhotos.objects.create(pk=uuid4(), postings=posting,
            image_url='https://example.test/my-machine.jpg', is_primary=True)
        self.populate()
        posting.refresh_from_db(); photo.refresh_from_db()
        self.assertEqual(posting.description, original_description)
        self.assertTrue(photo.is_primary)
        self.assertEqual(posting.postingsphotos_set.filter(is_primary=True).count(), 1)

    def test_explicit_admin_skip_does_not_claim_or_change_an_existing_account(self):
        self.populate(detailed=False, skip_admin=True)
        owner = Users.objects.get(pk=seed_id('user', 0))
        admin = Users.objects.create_user(email='admin@example.test', password='CustomAdminPassword',
            document='EXISTING-ADMIN', role='admin', name='Admin existente', address='Rua existente', birth_date=owner.birth_date)
        original = Users.objects.filter(pk=admin.pk).values().get()
        with self.assertRaises(SeedConflict):
            self.populate()
        self.populate(enrich_demo=True, skip_admin=True)
        self.assertEqual(Users.objects.filter(pk=admin.pk).values().get(), original)
        self.assertEqual(Users.objects.count(), 7)

    def test_new_pending_demo_avoids_an_existing_booking(self):
        now = timezone.now()
        self.populate(detailed=False, now=now)
        posting = Postings.objects.get(pk=seed_id('posting', 0))
        start = timezone.localtime(now).replace(hour=8, minute=0, second=0, microsecond=0) + timedelta(days=60)
        occupied = Rentals.objects.create(pk=uuid4(), postings=posting,
            lessee_id=seed_id('user', 1), start_date=start,
            end_date=start + timedelta(days=4), status='signed')
        self.populate(now=now)
        pending = Rentals.objects.get(pk=seed_id('detailed-rental', 12))
        self.assertGreater(pending.start_date, occupied.end_date)

    def test_failed_detail_insertion_rolls_back_enrichment_and_all_new_records(self):
        self.populate(detailed=False)
        user = Users.objects.get(pk=seed_id('user', 0))
        original = user.address
        with patch('demo_seed.details.RentalMeterReadings.objects.create', side_effect=RuntimeError('forced failure')):
            with self.assertRaisesMessage(RuntimeError, 'forced failure'):
                self.populate(enrich_demo=True)
        user.refresh_from_db()
        self.assertEqual(user.address, original)
        self.assertIsNone(user.profile_photo)
        self.assertFalse(PostingsPhotos.objects.exists())
        self.assertEqual(Rentals.objects.count(), 8)

    def test_public_serializers_expose_local_gallery_and_portraits(self):
        self.populate()
        posting = self.client.get(f"/api/postings/{seed_id('posting', 0)}")
        self.assertEqual(posting.status_code, 200)
        self.assertTrue(all(p['url'].startswith(ASSETS) for p in posting.json()['photos']))
        login = self.client.post('/api/login', {'email':'joao.silva@example.test', 'password':'Teste1234'}, content_type='application/json')
        user = self.client.get(f"/api/users/{seed_id('user', 0)}", HTTP_AUTHORIZATION=f"Bearer {login.json()['access']}")
        self.assertEqual(user.json()['profile_photo_url'], f'{ASSETS}/profiles/joao.png')

    def test_asset_manifest_has_sources_licenses_and_checksums(self):
        galleries = catalog.photos()
        self.assertEqual(set(galleries), {str(i) for i in range(20)})
        for photos in galleries.values():
            self.assertGreaterEqual(len(photos), 1)
            for photo in photos:
                self.assertTrue(photo['source'].startswith('https://commons.wikimedia.org/wiki/File:'))
                self.assertTrue(photo['license'].startswith(('CC BY', 'CC0')))
                self.assertTrue(photo['author'])
                self.assertEqual(len(photo['sha256']), 64)

    def test_asset_url_rejects_credentials_and_query_parameters(self):
        for base in ('ftp://localhost/demo', 'http://user:secret@localhost/demo', 'https://example.test/demo?token=secret'):
            with self.subTest(base=base), self.assertRaises(ValueError):
                seed_database(asset_base_url=base, dry_run=True)
        self.assertFalse(Users.objects.exists())
