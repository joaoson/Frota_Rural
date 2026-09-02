import json
import uuid
from datetime import date, timedelta

from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.db import IntegrityError, transaction
from django.test import Client, TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from api.models import Rentals
from machines.models import Machines
from postings.models import Postings
from users.models import Users

from .models import MessageReports, Messages
from .threads import format_thread_id, parse_thread_id

MEMORY_LAYER = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}


def make_user(role, name, seq):
    return Users.objects.create(
        id=uuid.uuid4(), name=name, document=f'doc{seq:011d}',
        email=f'{name.lower().replace(" ", "")}{seq}@teste.com', role=role,
        address='Rua Teste, 100', birth_date=date(1990, 1, 1), status='active',
    )


def build_world():
    """locador (dono) + locatario + operador + anúncio ativo + locação."""
    owner = make_user('locador', 'Locador', 1)
    lessee = make_user('locatario', 'Locatario', 2)
    operator = make_user('operador', 'Operador', 3)
    stranger = make_user('locatario', 'Estranho', 4)
    admin = make_user('admin', 'Admin', 5)
    machine = Machines.objects.create(
        id=uuid.uuid4(), owner=owner, renagro_number=f'RN-{uuid.uuid4().hex[:6]}',
        brand='John Deere', model='6135J', year=2021,
    )
    posting = Postings.objects.create(
        id=uuid.uuid4(), machinery=machine, hourly_rate='480.00', status='active',
        created_at=timezone.now(), updated_at=timezone.now(),
    )
    rental = Rentals.objects.create(
        id=uuid.uuid4(), postings=posting, lessee=lessee, operator=operator,
        start_date=timezone.now(), end_date=timezone.now() + timedelta(days=2),
        total_price='960.00', status='active',
        created_at=timezone.now(), updated_at=timezone.now(),
    )
    return locals()


class ThreadKeyTests(TestCase):
    def test_round_trip_and_order_normalisation(self):
        a, b = uuid.uuid4(), uuid.uuid4()
        scope_id = uuid.uuid4()
        one = format_thread_id('rental', scope_id, a, b)
        other = format_thread_id('rental', scope_id, b, a)
        self.assertEqual(one, other, 'ordem dos participantes deve normalizar')
        scope, sid, lo, hi = parse_thread_id(one)
        self.assertEqual((scope, str(sid)), ('rental', str(scope_id)))
        self.assertEqual([str(lo), str(hi)], sorted([str(a), str(b)]))

    def test_non_canonical_and_malformed_are_rejected(self):
        from .threads import ThreadError
        a, b = sorted([str(uuid.uuid4()), str(uuid.uuid4())])
        for bad in [f'rental:{uuid.uuid4()}:{b}:{a}', 'rental:nope:x:y', 'bogus:1:2:3', '']:
            with self.assertRaises(ThreadError):
                parse_thread_id(bad)


class ConstraintTests(TestCase):
    def setUp(self):
        self.w = build_world()

    def _msg(self, **kw):
        base = dict(sender=self.w['lessee'], receiver=self.w['owner'], content='oi')
        base.update(kw)
        return Messages.objects.create(**base)

    def test_exactly_one_scope_enforced(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self._msg(rental=self.w['rental'], posting=self.w['posting'])
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self._msg()

    def test_client_id_unique_per_sender(self):
        cid = uuid.uuid4()
        self._msg(rental=self.w['rental'], client_id=cid)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self._msg(rental=self.w['rental'], client_id=cid)


class ChatApiTests(TestCase):
    def setUp(self):
        self.w = build_world()
        # enforce_csrf_checks=True de propósito: o client padrão do Django
        # DESLIGA CSRF, e foi exatamente por isso que um encadeamento de views
        # @api_view passou nos testes e quebrava todo POST real com
        # "CSRF Failed: CSRF cookie not set". Sem isto, esta suíte é cega para
        # essa classe de bug.
        self.client = Client(enforce_csrf_checks=True)

    def auth(self, user):
        self.client.credentials = None
        token = str(AccessToken.for_user(user))
        return {'HTTP_AUTHORIZATION': f'Bearer {token}'}

    def resolve(self, user, scope, scope_id, peer_id=None):
        body = {'scope': scope, 'scope_id': str(scope_id)}
        if peer_id:
            body['peer_id'] = str(peer_id)
        return self.client.post('/api/chat/threads/resolve', body,
                                content_type='application/json', **self.auth(user))

    def test_posting_inquiry_flow_and_owner_cannot_start(self):
        w = self.w
        r = self.resolve(w['owner'], 'posting', w['posting'].id)
        self.assertEqual(r.status_code, 400)

        r = self.resolve(w['lessee'], 'posting', w['posting'].id)
        self.assertEqual(r.status_code, 200)
        thread = r.json()
        self.assertTrue(thread['can_write'])
        self.assertEqual(thread['peer']['id'], str(w['owner'].id))
        self.assertEqual(thread['scope_label'], 'John Deere 6135J')
        self.assertIsNone(thread['last_message'])
        tid = thread['thread_id']

        # dono não pode abrir, mas pode responder depois da primeira mensagem
        send = self.client.post(
            f'/api/chat/threads/{tid}/messages',
            {'content': 'Bom dia!', 'client_id': str(uuid.uuid4())},
            content_type='application/json', **self.auth(w['lessee']))
        self.assertEqual(send.status_code, 201)
        r = self.resolve(w['owner'], 'posting', w['posting'].id, peer_id=w['lessee'].id)
        self.assertTrue(r.json()['can_write'])

    def test_empty_thread_is_fetchable_before_any_message(self):
        """O inbox é derivado de `messages`, então uma conversa recém-aberta
        não aparece nele. Sem este endpoint a UI abre no vazio e não oferece o
        campo para mandar a primeira mensagem."""
        w = self.w
        r = self.resolve(w['lessee'], 'posting', w['posting'].id)
        tid = r.json()['thread_id']
        self.assertEqual(self.client.get('/api/chat/threads/', **self.auth(w['lessee'])).json()['count'], 0)

        got = self.client.get(f'/api/chat/threads/{tid}', **self.auth(w['lessee']))
        self.assertEqual(got.status_code, 200)
        self.assertIsNone(got.json()['last_message'])
        self.assertTrue(got.json()['can_write'], 'precisa poder mandar a primeira mensagem')
        self.assertEqual(
            self.client.get(f'/api/chat/threads/{tid}', **self.auth(w['stranger'])).status_code,
            403,
        )

    def test_inactive_posting_blocks_new_inquiry_only(self):
        w = self.w
        Postings.objects.filter(id=w['posting'].id).update(status='suspended')
        tid = format_thread_id('posting', w['posting'].id, w['lessee'].id, w['owner'].id)
        r = self.client.post(f'/api/chat/threads/{tid}/messages',
                             {'content': 'oi', 'client_id': str(uuid.uuid4())},
                             content_type='application/json', **self.auth(w['lessee']))
        self.assertEqual(r.status_code, 403)

        Messages.objects.create(sender=w['lessee'], receiver=w['owner'],
                                posting=w['posting'], content='antiga')
        r = self.client.post(f'/api/chat/threads/{tid}/messages',
                             {'content': 'segue', 'client_id': str(uuid.uuid4())},
                             content_type='application/json', **self.auth(w['lessee']))
        self.assertEqual(r.status_code, 201)

    def test_idempotent_send(self):
        w = self.w
        tid = format_thread_id('rental', w['rental'].id, w['lessee'].id, w['owner'].id)
        cid = str(uuid.uuid4())
        body = {'content': 'mesma', 'client_id': cid}
        first = self.client.post(f'/api/chat/threads/{tid}/messages', body,
                                 content_type='application/json', **self.auth(w['lessee']))
        second = self.client.post(f'/api/chat/threads/{tid}/messages', body,
                                  content_type='application/json', **self.auth(w['lessee']))
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json()['id'], second.json()['id'])
        self.assertEqual(Messages.objects.filter(client_id=cid).count(), 1)

    def test_authz_matrix(self):
        w = self.w
        tid = format_thread_id('rental', w['rental'].id, w['lessee'].id, w['owner'].id)
        cases = [
            (w['lessee'], 200, 201), (w['owner'], 200, 201),
            (w['stranger'], 403, 403),
            (w['admin'], 200, 403),   # admin lê tudo, escreve nada
        ]
        for user, read_code, write_code in cases:
            got = self.client.get(f'/api/chat/threads/{tid}/messages', **self.auth(user))
            self.assertEqual(got.status_code, read_code, f'read {user.role}')
            wrote = self.client.post(f'/api/chat/threads/{tid}/messages',
                                     {'content': 'x', 'client_id': str(uuid.uuid4())},
                                     content_type='application/json', **self.auth(user))
            self.assertEqual(wrote.status_code, write_code, f'write {user.role}')

    def test_cancelled_rental_is_read_only(self):
        w = self.w
        Rentals.objects.filter(id=w['rental'].id).update(status='cancelled')
        tid = format_thread_id('rental', w['rental'].id, w['lessee'].id, w['owner'].id)
        self.assertEqual(self.client.get(f'/api/chat/threads/{tid}/messages',
                                         **self.auth(w['lessee'])).status_code, 200)
        self.assertEqual(self.client.post(
            f'/api/chat/threads/{tid}/messages',
            {'content': 'x', 'client_id': str(uuid.uuid4())},
            content_type='application/json', **self.auth(w['lessee'])).status_code, 403)

    def test_inbox_derivation_counts_operator_thread_separately(self):
        w = self.w
        Messages.objects.create(sender=w['lessee'], receiver=w['owner'],
                                rental=w['rental'], content='ao locador')
        Messages.objects.create(sender=w['lessee'], receiver=w['operator'],
                                rental=w['rental'], content='ao operador')
        Messages.objects.create(sender=w['lessee'], receiver=w['owner'],
                                posting=w['posting'], content='sobre o anuncio')
        r = self.client.get('/api/chat/threads/', **self.auth(w['lessee']))
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data['count'], 3, 'locação com operador gera duas threads pareadas')
        self.assertEqual(len(data['results']), 3)

    def test_keyset_pagination_has_no_gaps_or_repeats(self):
        w = self.w
        for i in range(120):
            Messages.objects.create(
                sender=w['lessee'], receiver=w['owner'], rental=w['rental'],
                content=f'msg {i}', sent_at=timezone.now() + timedelta(seconds=i))
        tid = format_thread_id('rental', w['rental'].id, w['lessee'].id, w['owner'].id)
        seen, cursor = [], None
        while True:
            url = f'/api/chat/threads/{tid}/messages?limit=50'
            if cursor:
                url += f'&before={cursor[0]}&before_id={cursor[1]}'
            page = self.client.get(url, **self.auth(w['lessee'])).json()
            seen.extend(m['id'] for m in page['results'])
            if not page['has_more']:
                break
            last = page['results'][-1]
            cursor = (last['sent_at'], last['id'])
        self.assertEqual(len(seen), 120)
        self.assertEqual(len(set(seen)), 120, 'sem repetidos')

    def test_read_receipts_and_unread(self):
        w = self.w
        for i in range(3):
            Messages.objects.create(sender=w['owner'], receiver=w['lessee'],
                                    rental=w['rental'], content=f'n{i}')
        tid = format_thread_id('rental', w['rental'].id, w['lessee'].id, w['owner'].id)
        self.assertEqual(self.client.get('/api/chat/unread',
                                         **self.auth(w['lessee'])).json()['unread_total'], 3)
        # o remetente não "lê" as próprias mensagens
        r = self.client.post(f'/api/chat/threads/{tid}/read', {},
                             content_type='application/json', **self.auth(w['owner']))
        self.assertEqual(r.json()['updated'], 0)

        r = self.client.post(f'/api/chat/threads/{tid}/read', {},
                             content_type='application/json', **self.auth(w['lessee']))
        self.assertEqual(r.json()['updated'], 3)
        self.assertEqual(r.json()['unread_total'], 0)
        again = self.client.post(f'/api/chat/threads/{tid}/read', {},
                                 content_type='application/json', **self.auth(w['lessee']))
        self.assertEqual(again.json()['updated'], 0, 'idempotente')

    @override_settings(CHAT_BANNED_WORDS=['golpe'])
    def test_banned_word_flags_but_still_delivers(self):
        w = self.w
        tid = format_thread_id('rental', w['rental'].id, w['lessee'].id, w['owner'].id)
        r = self.client.post(f'/api/chat/threads/{tid}/messages',
                             {'content': 'isso é golpe', 'client_id': str(uuid.uuid4())},
                             content_type='application/json', **self.auth(w['lessee']))
        self.assertEqual(r.status_code, 201)
        self.assertTrue(r.json()['flagged_for_moderation'])
        listed = self.client.get(f'/api/chat/threads/{tid}/messages',
                                 **self.auth(w['owner'])).json()
        self.assertEqual(len(listed['results']), 1, 'continua entregue')

    def test_report_rules(self):
        w = self.w
        m = Messages.objects.create(sender=w['owner'], receiver=w['lessee'],
                                    rental=w['rental'], content='ofensa')
        url = f'/api/chat/messages/{m.id}/report'
        body = {'reason': 'Conteúdo ofensivo.'}
        self.assertEqual(self.client.post(url, body, content_type='application/json',
                                          **self.auth(w['stranger'])).status_code, 403)
        self.assertEqual(self.client.post(url, body, content_type='application/json',
                                          **self.auth(w['owner'])).status_code, 403)
        self.assertEqual(self.client.post(url, body, content_type='application/json',
                                          **self.auth(w['lessee'])).status_code, 200)
        self.assertEqual(self.client.post(url, body, content_type='application/json',
                                          **self.auth(w['lessee'])).status_code, 409)
        m.refresh_from_db()
        self.assertTrue(m.flagged_for_moderation)

    def test_admin_queue_hide_masks_content_for_participants_only(self):
        w = self.w
        m = Messages.objects.create(sender=w['owner'], receiver=w['lessee'],
                                    rental=w['rental'], content='ameaça')
        MessageReports.objects.create(message=m, reported_by=w['lessee'], reason='ruim')
        Messages.objects.filter(id=m.id).update(flagged_for_moderation=True)

        q = self.client.get('/api/admin/chat/messages/', **self.auth(w['admin']))
        self.assertEqual(q.status_code, 200)
        self.assertEqual(q.json()['count'], 1)
        self.assertEqual(q.json()['results'][0]['source'], 'report')

        self.assertEqual(self.client.get('/api/admin/chat/messages/',
                                         **self.auth(w['lessee'])).status_code, 403)

        r = self.client.put(f'/api/admin/chat/messages/{m.id}/resolve',
                            {'decision': 'hide', 'note': 'ameaça direta'},
                            content_type='application/json', **self.auth(w['admin']))
        self.assertEqual(r.status_code, 200)

        tid = format_thread_id('rental', w['rental'].id, w['lessee'].id, w['owner'].id)
        as_user = self.client.get(f'/api/chat/threads/{tid}/messages',
                                  **self.auth(w['lessee'])).json()['results'][0]
        self.assertTrue(as_user['hidden'])
        self.assertIsNone(as_user['content'])
        as_admin = self.client.get(f'/api/chat/threads/{tid}/messages',
                                   **self.auth(w['admin'])).json()['results'][0]
        self.assertEqual(as_admin['content'], 'ameaça')

    def test_fan_out_payload_is_json_serialisable(self):
        """Guarda o modo de falha que só apareceria com Redis: o msgpack do
        channels_redis estoura em UUID/datetime crus, o InMemory não."""
        w = self.w
        m = Messages.objects.create(sender=w['lessee'], receiver=w['owner'],
                                    rental=w['rental'], content='oi',
                                    client_id=uuid.uuid4())
        from .serializer import serialize_message
        payload = serialize_message(m)
        json.dumps(payload)  # levanta TypeError se algum campo não for primitivo


@override_settings(CHANNEL_LAYERS=MEMORY_LAYER)
class ChatConsumerTests(TransactionTestCase):
    """TransactionTestCase (não TestCase): o wrapper atômico do TestCase trava
    contra trabalho de banco assíncrono via database_sync_to_async."""

    def setUp(self):
        self.w = build_world()

    @staticmethod
    def connect(user):
        from djangoapi.asgi import application
        token = str(AccessToken.for_user(user))
        return WebsocketCommunicator(
            application, '/ws/chat',
            subprotocols=['bearer', token],
            # OriginValidator exige o header; sem ele a recusa parece erro de JWT.
            headers=[(b'origin', b'http://localhost:5173')],
        )

    async def test_valid_token_connects_and_echoes_subprotocol(self):
        comm = self.connect(self.w['lessee'])
        try:
            connected, subprotocol = await comm.connect()
            self.assertTrue(connected)
            # Sem este echo todo browser fecha o socket na hora.
            self.assertEqual(subprotocol, 'bearer')
        finally:
            await comm.disconnect()

    async def test_missing_token_closes_4401(self):
        from djangoapi.asgi import application
        comm = WebsocketCommunicator(application, '/ws/chat',
                                     headers=[(b'origin', b'http://localhost:5173')])
        try:
            connected, code = await comm.connect()
            self.assertFalse(connected)
            self.assertEqual(code, 4401)
        finally:
            await comm.disconnect()

    async def test_forbidden_subscribe_errors_but_keeps_socket_open(self):
        w = self.w
        tid = format_thread_id('rental', w['rental'].id, w['lessee'].id, w['owner'].id)
        comm = self.connect(w['stranger'])
        try:
            await comm.connect()
            await comm.send_json_to({'type': 'thread.subscribe', 'thread_id': tid})
            reply = await comm.receive_json_from()
            self.assertEqual(reply['type'], 'error')
            self.assertEqual(reply['code'], 'forbidden')
            await comm.send_json_to({'type': 'ping'})
            self.assertEqual((await comm.receive_json_from())['type'], 'pong')
        finally:
            await comm.disconnect()

    async def test_message_reaches_the_other_participant(self):
        w = self.w
        tid = format_thread_id('rental', w['rental'].id, w['lessee'].id, w['owner'].id)
        cid = str(uuid.uuid4())
        a, b = self.connect(w['lessee']), self.connect(w['owner'])
        try:
            await a.connect()
            await b.connect()
            for c in (a, b):
                await c.send_json_to({'type': 'thread.subscribe', 'thread_id': tid})
                self.assertEqual((await c.receive_json_from())['type'], 'thread.subscribed')
            await a.send_json_to({'type': 'message.send', 'thread_id': tid,
                                  'content': 'chegou?', 'client_id': cid})
            event = await b.receive_json_from()
            self.assertEqual(event['type'], 'message.new')
            self.assertEqual(event['message']['content'], 'chegou?')
            self.assertEqual(event['message']['client_id'], cid)
        finally:
            await a.disconnect()
            await b.disconnect()
