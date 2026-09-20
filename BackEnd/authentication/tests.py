from datetime import date, timedelta

from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from users.models import Users


class SessionTests(TestCase):
    def setUp(self):
        self.user = Users.objects.create(
            name='Session Test', document='11122233344', email='session@test.com',
            role='locador', address='Rua Teste, 100', birth_date=date(1990, 1, 1),
            status='active',
        )
        self.user.set_password('test-session-password')
        self.user.save()
        self.refresh = RefreshToken.for_user(self.user)
        access = self.refresh.access_token
        access.set_exp(lifetime=timedelta(seconds=-1))
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')

    def test_expired_access_returns_401_to_trigger_frontend_refresh(self):
        response = self.client.get('/api/users/operators')
        self.assertEqual(response.status_code, 401)
        self.assertTrue(response['WWW-Authenticate'].startswith('Bearer'))

    def test_valid_cookie_renews_session_despite_expired_access_header(self):
        self.client.cookies['refresh_token'] = str(self.refresh)
        response = self.client.post('/api/login/refresh')
        self.assertEqual(response.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {response.json()["access"]}')
        self.assertEqual(self.client.get('/api/users/operators').status_code, 200)

    def test_login_accepts_credentials_despite_expired_access_header(self):
        response = self.client.post('/api/login', {
            'email': self.user.email, 'password': 'test-session-password',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.json())
        self.assertTrue(response.cookies['refresh_token']['httponly'])

    def test_logout_clears_cookie_despite_expired_access_header(self):
        self.client.cookies['refresh_token'] = str(self.refresh)
        response = self.client.post('/api/logout')
        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.cookies['refresh_token']['max-age'], 0)
        self.assertEqual(response.cookies['refresh_token']['path'], '/api/login')

    def test_invalid_or_missing_cookie_cannot_restore_session(self):
        for cookie in ('', 'invalid'):
            with self.subTest(cookie=cookie):
                self.client.cookies['refresh_token'] = cookie
                self.assertEqual(self.client.post('/api/login/refresh').status_code, 401)
