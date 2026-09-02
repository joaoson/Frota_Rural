"""ChatConsumer — contrato WebSocket canônico (§3.3 do plano).

Uma única conexão multiplexada por cliente: `ws://<host>/ws/chat`. Assinaturas
de thread são dinâmicas, então reconectar custa um handshake só.

AUTENTICAÇÃO
    new WebSocket(url, ["bearer", accessToken])
O servidor valida em `JWTAuthMiddleware` e responde
`accept(subprotocol="bearer")`. Aceitar SEM devolver o subprotocolo faz todo
browser fechar a conexão na hora, com um 1006 sem erro no servidor — é a falha
de integração mais provável desta feature, e o teste que a cobre é o primeiro
do suite.

CÓDIGOS DE FECHAMENTO
    1000  normal                       cliente não reconecta
    1006/1011 erro de transporte       reconecta com backoff
    4401  token ausente/inválido       refresh + 1 retry; segundo 4401 -> logout
    4403  autenticado mas proibido     para de reconectar
    4429  rate limit                   espera 30s

CLIENTE -> SERVIDOR
    {"type":"thread.subscribe","thread_id":"..."}
    {"type":"thread.unsubscribe","thread_id":"..."}
    {"type":"message.send","thread_id":"...","content":"...","client_id":"..."}
    {"type":"message.read","thread_id":"...","up_to":"...Z"}
    {"type":"typing","thread_id":"...","is_typing":true}
    {"type":"ping"}

SERVIDOR -> CLIENTE
    {"type":"thread.subscribed","thread_id":"...","thread":{...}}
    {"type":"message.new","thread_id":"...","message":{...}}
    {"type":"message.read","thread_id":"...","reader_id":"...","up_to":"...Z","message_ids":[...]}
    {"type":"message.hidden","thread_id":"...","message_id":"..."}
    {"type":"typing","thread_id":"...","user_id":"...","is_typing":true}
    {"type":"unread.updated","unread_total":N,"unread_threads":N}
    {"type":"thread.updated","thread":{...}}
    {"type":"error","code":"...","message":"..."}
    {"type":"pong","server_time":"...Z"}

Falha por thread devolve `error` e MANTÉM o socket aberto; só falha de conexão
fecha. `type` desconhecido -> error/invalid_payload, nunca close.
"""

import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.utils import timezone

from . import selectors, services
from .serializer import serialize_message
from .threads import (
    SCOPE_RENTAL,
    ThreadError,
    can_read,
    can_write,
    group_name,
    load_scope,
    parse_thread_id,
    user_group_name,
)

ERROR_FOR_STATUS = {400: 'invalid_thread', 403: 'forbidden', 404: 'not_found', 429: 'rate_limited'}


class ChatConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        user = self.scope.get('user')
        if user is None or not user.is_authenticated:
            await self.close(code=4401)
            return
        self.user = user
        self.subscribed = set()
        # accept COM subprotocolo: sem isto o browser fecha imediatamente.
        await self.accept(subprotocol='bearer')
        await self.channel_layer.group_add(user_group_name(user.id), self.channel_name)

    async def disconnect(self, code):
        for thread_id in list(getattr(self, 'subscribed', ())):
            await self.channel_layer.group_discard(group_name(thread_id), self.channel_name)
        if hasattr(self, 'user'):
            await self.channel_layer.group_discard(
                user_group_name(self.user.id), self.channel_name
            )

    async def receive(self, text_data=None, bytes_data=None):
        try:
            data = json.loads(text_data or '{}')
            if not isinstance(data, dict):
                raise ValueError
        except (ValueError, TypeError):
            return await self._error('invalid_payload', 'Mensagem malformada.')

        handler = {
            'thread.subscribe': self._on_subscribe,
            'thread.unsubscribe': self._on_unsubscribe,
            'message.send': self._on_send,
            'message.read': self._on_read,
            'typing': self._on_typing,
            'ping': self._on_ping,
        }.get(data.get('type'))

        if handler is None:
            return await self._error('invalid_payload', 'Tipo de evento desconhecido.')
        try:
            await handler(data)
        except ThreadError as exc:
            await self._error(ERROR_FOR_STATUS.get(exc.status, 'server_error'), exc.message)

    # --- handlers ----------------------------------------------------------

    async def _on_subscribe(self, data):
        thread_id = data.get('thread_id') or ''
        thread = await self._authorize_read(thread_id)
        await self.channel_layer.group_add(group_name(thread_id), self.channel_name)
        self.subscribed.add(thread_id)
        await self._send({'type': 'thread.subscribed', 'thread_id': thread_id, 'thread': thread})

    async def _on_unsubscribe(self, data):
        thread_id = data.get('thread_id') or ''
        if thread_id in self.subscribed:
            await self.channel_layer.group_discard(group_name(thread_id), self.channel_name)
            self.subscribed.discard(thread_id)

    async def _on_send(self, data):
        thread_id = data.get('thread_id') or ''
        if thread_id not in self.subscribed:
            return await self._error('not_subscribed', 'Assine a conversa antes de enviar.')
        payload, receiver_id, created = await self._persist(
            thread_id, data.get('content'), data.get('client_id')
        )
        if created:
            await database_sync_to_async(services.push_unread)(receiver_id)

    async def _on_read(self, data):
        thread_id = data.get('thread_id') or ''
        await self._mark_read(thread_id, data.get('up_to'))

    async def _on_typing(self, data):
        thread_id = data.get('thread_id') or ''
        if thread_id not in self.subscribed:
            return
        await self.channel_layer.group_send(group_name(thread_id), {
            'type': 'chat.typing',
            'thread_id': thread_id,
            'user_id': str(self.user.id),
            'is_typing': bool(data.get('is_typing')),
        })

    async def _on_ping(self, _data):
        await self._send({
            'type': 'pong',
            'server_time': timezone.now().isoformat().replace('+00:00', 'Z'),
        })

    # --- DB helpers --------------------------------------------------------

    @database_sync_to_async
    def _authorize_read(self, thread_id):
        from .views import _thread_payload
        scope, scope_id, lo, hi = parse_thread_id(thread_id)
        scope_obj = load_scope(scope, scope_id)
        can_read(self.user, scope, scope_obj, {str(lo), str(hi)})
        return _thread_payload(self.user, thread_id, scope, scope_id, lo, hi, scope_obj)

    @database_sync_to_async
    def _persist(self, thread_id, content, client_id):
        from .views import _thread_qs
        scope, scope_id, lo, hi = parse_thread_id(thread_id)
        scope_obj = load_scope(scope, scope_id)
        qs = _thread_qs(scope, scope_id, lo, hi)
        # Revalida a escrita a cada envio: o token vale 15 min mas o socket vive
        # mais, então um usuário banido no meio da sessão para aqui.
        can_write(self.user, scope, scope_obj, {str(lo), str(hi)}, qs.exists())
        services.check_rate_limit(self.user.id)
        receiver_id = hi if str(lo) == str(self.user.id) else lo
        payload, created = services.create_message(
            sender=self.user, receiver_id=receiver_id, scope=scope, scope_id=scope_id,
            content=content, client_id=client_id, thread_id=thread_id,
        )
        return payload, receiver_id, created

    @database_sync_to_async
    def _mark_read(self, thread_id, up_to):
        from .views import _thread_qs
        scope, scope_id, lo, hi = parse_thread_id(thread_id)
        scope_obj = load_scope(scope, scope_id)
        can_read(self.user, scope, scope_obj, {str(lo), str(hi)})
        pending = _thread_qs(scope, scope_id, lo, hi).filter(
            receiver=self.user, read_at__isnull=True
        )
        if up_to:
            pending = pending.filter(sent_at__lte=up_to)
        ids = list(pending.values_list('id', flat=True)[:500])
        now = timezone.now()
        if pending.update(read_at=now):
            services.fan_out_read(
                thread_id, self.user.id, now.isoformat().replace('+00:00', 'Z'), ids
            )
        services.push_unread(self.user.id)

    # --- group event handlers ----------------------------------------------

    async def chat_message_new(self, event):
        await self._send({
            'type': 'message.new',
            'thread_id': event['thread_id'],
            'message': event['message'],
        })

    async def chat_message_read(self, event):
        await self._send({k: v for k, v in event.items() if k != 'type'} | {'type': 'message.read'})

    async def chat_message_hidden(self, event):
        await self._send({
            'type': 'message.hidden',
            'thread_id': event['thread_id'],
            'message_id': event['message_id'],
        })

    async def chat_typing(self, event):
        if event['user_id'] == str(self.user.id):
            return  # não ecoa o próprio "digitando"
        await self._send({
            'type': 'typing',
            'thread_id': event['thread_id'],
            'user_id': event['user_id'],
            'is_typing': event['is_typing'],
        })

    async def chat_unread_updated(self, event):
        await self._send({
            'type': 'unread.updated',
            'unread_total': event['unread_total'],
            'unread_threads': event['unread_threads'],
        })

    async def chat_thread_touch(self, event):
        thread_id = event['thread_id']
        try:
            thread = await self._authorize_read(thread_id)
        except ThreadError:
            return
        await self._send({'type': 'thread.updated', 'thread': thread})

    # --- utils --------------------------------------------------------------

    async def _send(self, payload):
        await self.send(text_data=json.dumps(payload))

    async def _error(self, code, message):
        await self._send({'type': 'error', 'code': code, 'message': message})
