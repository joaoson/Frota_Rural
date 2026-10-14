from django.test import TestCase
from api.test_recurrence import RecurrenceFixtures
from administration.models import PostingModeration
from administration.enums import ModerationAction


class PostingModerationStatusTests(RecurrenceFixtures, TestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.owner)
        self.url = f'/api/postings/{self.posting.pk}'

    def test_owner_cannot_republish_moderated_listing(self):
        for status in ('rejected', 'suspended', 'pending_review'):
            self.posting.status = status
            self.posting.save(update_fields=['status'])
            for target in ('active', 'inactive', 'draft'):
                response = self.client.patch(self.url, {'status': target}, format='json')
                self.assertEqual(response.status_code, 400, (status, target, response.data))
                self.posting.refresh_from_db()
                self.assertEqual(self.posting.status, status)
            response = self.client.patch(self.url, {'description': 'Correção do anúncio', 'status': status}, format='json')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data['status'], status)

    def test_owner_can_pause_resume_and_publish_draft(self):
        for status in ('inactive', 'draft', 'active'):
            response = self.client.patch(self.url, {'status': status}, format='json')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data['status'], status)
        for status in ('approved', 'rejected', 'suspended', 'pending_review', 'arbitrary'):
            response = self.client.patch(self.url, {'status': status}, format='json')
            self.assertEqual(response.status_code, 400, response.data)
            response = self.client.post('/api/postings', {'machinery': str(self.machine.pk), 'hourly_rate': '50', 'status': status}, format='json')
            self.assertEqual(response.status_code, 400, response.data)

    def test_dedicated_admin_approval_unlocks_owner_controls(self):
        self.posting.status = 'rejected'
        self.posting.save(update_fields=['status'])
        admin = self.user('moderator', 'admin')
        self.client.force_authenticate(admin)
        response = self.client.put(f'/api/admin/postings/{self.posting.pk}/approve', {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(PostingModeration.objects.filter(posting=self.posting, moderator=admin, action=ModerationAction.APPROVED).exists())
        self.client.force_authenticate(self.owner)
        response = self.client.patch(self.url, {'status': 'inactive'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
