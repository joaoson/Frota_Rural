import uuid
from datetime import date, timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from authentication.models import PasswordResets
from users.models import Users

PASSWORD = "senha-forte-123"
SEND_RESET_EMAIL = "authentication.services.send_password_reset_email"


def make_user(status="active", email="jose@teste.com"):
    user = Users(
        id=uuid.uuid4(),
        name="José Almeida",
        document=f"doc{uuid.uuid4().hex[:11]}",
        email=email,
        role="locatario",
        address="Rua Teste, 100",
        birth_date=date(1990, 1, 1),
        status=status,
    )
    user.set_password(PASSWORD)
    user.save()
    return user


@override_settings(AUTH_REFRESH_COOKIE_NAME='refresh_token')
class LoginTests(TestCase):
    def login(self, email="jose@teste.com", password=PASSWORD, **extra):
        return self.client.post(
            "/api/login",
            {"email": email, "password": password},
            content_type="application/json",
            **extra,
        )

    def test_login_returns_access_and_sets_refresh_cookie(self):
        make_user()

        response = self.login()

        self.assertEqual(response.status_code, 200, response.content)
        self.assertIn("access", response.json())
        cookie = response.cookies["refresh_token"]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["path"], "/api/login")

    def test_wrong_password_and_unknown_email_look_the_same(self):
        make_user()

        wrong_password = self.login(password="errada")
        unknown_email = self.login(email="ninguem@teste.com")

        for response in (wrong_password, unknown_email):
            self.assertEqual(response.status_code, 401)
            self.assertEqual(
                response.json(),
                {
                    "code": "invalid_credentials",
                    "message": "E-mail ou senha inválidos.",
                    "errors": {},
                },
            )

    def test_banned_account_cannot_log_in(self):
        make_user(status="banned")

        response = self.login()

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "account_disabled")

    def test_stale_bearer_header_does_not_block_login(self):
        make_user()

        response = self.login(HTTP_AUTHORIZATION="Bearer token-vencido")

        self.assertEqual(response.status_code, 200, response.content)

    def test_invalid_payload_is_a_validation_error(self):
        response = self.login(email="nao-e-email")

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.json()["errors"])


@override_settings(AUTH_REFRESH_COOKIE_NAME='refresh_token')
class RefreshAndLogoutTests(TestCase):
    def test_refresh_uses_the_cookie_set_on_login(self):
        make_user()
        self.client.post(
            "/api/login",
            {"email": "jose@teste.com", "password": PASSWORD},
            content_type="application/json",
        )

        response = self.client.post("/api/login/refresh")

        self.assertEqual(response.status_code, 200, response.content)
        self.assertIn("access", response.json())

    def test_refresh_without_cookie_is_401(self):
        response = self.client.post("/api/login/refresh")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["code"], "missing_refresh_token")

    def test_refresh_with_garbage_cookie_is_401(self):
        self.client.cookies["refresh_token"] = "lixo"

        response = self.client.post("/api/login/refresh")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["code"], "invalid_refresh_token")

    def test_logout_clears_the_cookie(self):
        response = self.client.post("/api/logout")

        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.cookies["refresh_token"]["max-age"], 0)

    def test_verify_rejects_invalid_token_with_401(self):
        response = self.client.post(
            "/api/login/verify", {"token": "invalido"}, content_type="application/json"
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["code"], "token_not_valid")


class NamespacedSessionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.local_user = make_user(email='local@teste.com')
        cls.hosted_user = make_user(email='hosted@teste.com')

    def login(self, user, cookie_name):
        with override_settings(AUTH_REFRESH_COOKIE_NAME=cookie_name):
            response = self.client.post('/api/login', {
                'email': user.email, 'password': PASSWORD,
            }, content_type='application/json')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(set(response.cookies), {cookie_name})
        return response

    def test_two_cookie_names_keep_independent_users_in_the_same_browser(self):
        self.login(self.local_user, 'frota_local_refresh')
        self.login(self.hosted_user, 'frota_hosted_refresh')
        self.assertEqual(set(self.client.cookies), {'frota_local_refresh', 'frota_hosted_refresh'})

        for user, name in ((self.local_user, 'frota_local_refresh'), (self.hosted_user, 'frota_hosted_refresh')):
            with self.subTest(cookie=name), override_settings(AUTH_REFRESH_COOKIE_NAME=name):
                response = self.client.post('/api/login/refresh')
                self.assertEqual(response.status_code, 200, response.content)
                self.assertEqual(AccessToken(response.json()['access'])['user_id'], str(user.pk))

    def test_refresh_rejects_other_namespace_and_legacy_cookie(self):
        self.login(self.hosted_user, 'frota_hosted_refresh')
        self.client.cookies['refresh_token'] = self.client.cookies['frota_hosted_refresh'].value

        with override_settings(AUTH_REFRESH_COOKIE_NAME='frota_local_refresh'):
            response = self.client.post('/api/login/refresh')

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['code'], 'missing_refresh_token')

    def test_logout_only_expires_its_own_namespace(self):
        self.login(self.local_user, 'frota_local_refresh')
        self.login(self.hosted_user, 'frota_hosted_refresh')
        hosted_cookie = self.client.cookies['frota_hosted_refresh'].value

        with override_settings(AUTH_REFRESH_COOKIE_NAME='frota_local_refresh'):
            response = self.client.post('/api/logout')
            self.assertEqual(response.status_code, 204)
            self.assertEqual(set(response.cookies), {'frota_local_refresh'})
            self.assertEqual(response.cookies['frota_local_refresh']['max-age'], 0)
            self.assertEqual(response.cookies['frota_local_refresh']['path'], '/api/login')
            self.assertEqual(self.client.post('/api/login/refresh').status_code, 401)

        self.assertEqual(self.client.cookies['frota_hosted_refresh'].value, hosted_cookie)
        with override_settings(AUTH_REFRESH_COOKIE_NAME='frota_hosted_refresh'):
            self.assertEqual(self.client.post('/api/login/refresh').status_code, 200)

    def test_custom_cookie_keeps_existing_security_and_path_contract(self):
        for debug in (True, False):
            with self.subTest(debug=debug), override_settings(DEBUG=debug):
                response = self.login(self.local_user, 'frota_local_refresh')
                cookie = response.cookies['frota_local_refresh']
                self.assertTrue(cookie['httponly'])
                self.assertEqual(cookie['samesite'], 'Lax')
                self.assertEqual(bool(cookie['secure']), not debug)
                self.assertEqual(cookie['path'], '/api/login')
                self.assertGreater(cookie['max-age'], 0)


@override_settings(DEBUG=False)
class PasswordResetTests(TestCase):
    def request_reset(self, email):
        with patch(SEND_RESET_EMAIL) as send:
            response = self.client.post(
                "/api/password-reset/request", {"email": email}, content_type="application/json"
            )
        return response, send

    def confirm(self, token, new_password="nova-senha-456"):
        return self.client.post(
            "/api/password-reset/confirm",
            {"token": token, "new_password": new_password},
            content_type="application/json",
        )

    def test_unknown_email_gets_the_same_response_without_email(self):
        known_user = make_user()
        known, _ = self.request_reset(known_user.email)
        unknown, send = self.request_reset("ninguem@teste.com")

        self.assertEqual(unknown.status_code, 200)
        self.assertEqual(unknown.json(), known.json())
        send.assert_not_called()

    def test_new_request_invalidates_the_previous_token(self):
        user = make_user()
        self.request_reset(user.email)
        self.request_reset(user.email)

        self.assertEqual(PasswordResets.objects.filter(user=user, used=False).count(), 1)

    def test_confirm_changes_password_once(self):
        user = make_user()
        _, send = self.request_reset(user.email)
        token = send.call_args.args[1]

        response = self.confirm(token)

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json(), {"message": "Senha atualizada com sucesso."})
        user.refresh_from_db()
        self.assertTrue(user.check_password("nova-senha-456"))

        reused = self.confirm(token, new_password="outra-senha-789")
        self.assertEqual(reused.status_code, 400)
        self.assertEqual(reused.json()["message"], "Token inválido, expirado ou já utilizado.")

    def test_email_failure_discards_the_token(self):
        user = make_user()
        with patch(SEND_RESET_EMAIL, side_effect=RuntimeError("resend fora do ar")):
            response = self.client.post(
                "/api/password-reset/request",
                {"email": user.email},
                content_type="application/json",
            )

        self.assertEqual(response.status_code, 502)
        self.assertFalse(PasswordResets.objects.exists())



@override_settings(AUTH_REFRESH_COOKIE_NAME='refresh_token')
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
