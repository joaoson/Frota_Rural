import uuid
from datetime import date

from django.test import Client, TestCase
from rest_framework_simplejwt.tokens import AccessToken

from users.models import Users


def make_user(role, name, seq):
    return Users.objects.create(
        id=uuid.uuid4(), name=name, document=f'doc{seq:011d}',
        email=f'{name.lower().replace(" ", "")}{seq}@teste.com', role=role,
        address='Rua Teste, 100', birth_date=date(1990, 1, 1), status='active',
    )


def auth(user):
    return {'HTTP_AUTHORIZATION': f'Bearer {AccessToken.for_user(user)}'}


NEW_OPERATOR = {
    'name': 'Carlos Santos',
    'document': '11122233344',
    'email': 'carlos.operador@teste.com',
    'phone': '+5541999990000',
    'address': 'Rua Ipê, 33',
    'city': 'Curitiba',
    'state': 'PR',
    'cep': '80000000',
    'birth_date': '1988-11-05',
    'password': 'senha-forte-123',
}


class OperatorTeamTests(TestCase):
    """Equipe de operadores: cada empregador só enxerga e mexe na sua."""

    def setUp(self):
        self.client = Client()
        self.lessee = make_user('locatario', 'Locatario', 1)
        self.other = make_user('locatario', 'Outro', 2)

    def create_operator(self, as_user=None, **overrides):
        payload = {**NEW_OPERATOR, **overrides}
        return self.client.post(
            '/api/users/operators', payload,
            content_type='application/json', **auth(as_user or self.lessee),
        )

    def test_requires_authentication(self):
        # DRF responde 403 (e não 401) porque SessionAuthentication vem primeiro
        # em DEFAULT_AUTHENTICATION_CLASSES e não emite WWW-Authenticate.
        self.assertEqual(self.client.get('/api/users/operators').status_code, 403)

    def test_create_links_operator_to_the_caller(self):
        response = self.create_operator()
        self.assertEqual(response.status_code, 201, response.content)

        operator = Users.objects.get(email=NEW_OPERATOR['email'])
        self.assertEqual(operator.role, 'operador')
        self.assertEqual(operator.employer_id, self.lessee.id)
        self.assertTrue(operator.check_password(NEW_OPERATOR['password']))
        # A senha nunca volta no corpo, nem o papel/vínculo que o cliente não define.
        self.assertNotIn('password', response.json())
        self.assertNotIn('employer', response.json())

    def test_create_ignores_client_supplied_role_and_employer(self):
        response = self.create_operator(role='admin', employer=str(self.other.id))
        self.assertEqual(response.status_code, 201, response.content)

        operator = Users.objects.get(email=NEW_OPERATOR['email'])
        self.assertEqual(operator.role, 'operador')
        self.assertEqual(operator.employer_id, self.lessee.id)

    def test_duplicate_email_is_reported_by_field(self):
        # O UniqueValidator do ModelSerializer pega antes do banco: vira 400 com
        # o erro no campo. O IntegrityError tratado na view cobre só a corrida
        # entre duas requisições simultâneas.
        self.assertEqual(self.create_operator().status_code, 201)
        response = self.create_operator(document='55566677788')
        self.assertEqual(response.status_code, 400)
        self.assertIn('email', response.json())

    def test_list_returns_only_my_team(self):
        self.create_operator()
        self.create_operator(
            as_user=self.other, email='outro.op@teste.com', document='99988877766',
        )

        response = self.client.get('/api/users/operators', **auth(self.lessee))
        self.assertEqual(response.status_code, 200)
        emails = [o['email'] for o in response.json()]
        self.assertEqual(emails, [NEW_OPERATOR['email']])

    def test_cannot_read_or_edit_another_employers_operator(self):
        self.create_operator()
        operator_id = Users.objects.get(email=NEW_OPERATOR['email']).id
        url = f'/api/users/operators/{operator_id}'

        self.assertEqual(self.client.get(url, **auth(self.other)).status_code, 404)
        patch = self.client.patch(
            url, {'name': 'Invadido'},
            content_type='application/json', **auth(self.other),
        )
        self.assertEqual(patch.status_code, 404)
        self.assertEqual(self.client.delete(url, **auth(self.other)).status_code, 404)
        self.assertEqual(Users.objects.get(pk=operator_id).name, NEW_OPERATOR['name'])

    def test_patch_updates_my_operator(self):
        self.create_operator()
        operator_id = Users.objects.get(email=NEW_OPERATOR['email']).id

        response = self.client.patch(
            f'/api/users/operators/{operator_id}', {'city': 'Sorriso', 'state': 'MT'},
            content_type='application/json', **auth(self.lessee),
        )
        self.assertEqual(response.status_code, 200, response.content)
        operator = Users.objects.get(pk=operator_id)
        self.assertEqual(operator.city, 'Sorriso')
        self.assertEqual(operator.state, 'MT')

    def test_delete_unlinks_without_deleting_the_account(self):
        self.create_operator()
        operator_id = Users.objects.get(email=NEW_OPERATOR['email']).id

        response = self.client.delete(
            f'/api/users/operators/{operator_id}', **auth(self.lessee),
        )
        self.assertEqual(response.status_code, 204)
        operator = Users.objects.get(pk=operator_id)
        self.assertIsNone(operator.employer_id)
        self.assertEqual(operator.role, 'operador')
        self.assertEqual(self.client.get('/api/users/operators', **auth(self.lessee)).json(), [])

    def test_banned_document_is_blocked(self):
        Users.objects.create(
            id=uuid.uuid4(), name='Banido', document=NEW_OPERATOR['document'],
            email='banido@teste.com', role='operador', address='Rua X',
            birth_date=date(1990, 1, 1), status='banned',
        )
        response = self.create_operator()
        self.assertEqual(response.status_code, 403)
