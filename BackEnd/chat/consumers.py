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
fecha. `type` desconhecido -> error/invalid_payload, nunca close. Os `code` do
evento `error` são os mesmos do corpo de erro REST (`ThreadError.code`).
"""

import json
import uuid
from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from chat.serializer import iso_utc
from chat.services import ChatService, ThreadService, validation_message
from chat.threads import ThreadError, group_name, user_group_name
from users.models import Users

type Event = dict[str, Any]


class ChatConsumer(AsyncWebsocketConsumer):
    user: Users
    subscribed: set[str]

    async def connect(self) -> None:
        user = self.scope.get("user")
        if not isinstance(user, Users) or not user.is_authenticated:
            await self.close(code=4401)
            return
        self.user = user
        self.subscribed = set()
        # accept COM subprotocolo: sem isto o browser fecha imediatamente.
        await self.accept(subprotocol="bearer")
        await self.channel_layer.group_add(user_group_name(user.id), self.channel_name)

    async def disconnect(self, code: int) -> None:
        for thread_id in list(getattr(self, "subscribed", ())):
            await self.channel_layer.group_discard(group_name(thread_id), self.channel_name)
        if hasattr(self, "user"):
            await self.channel_layer.group_discard(user_group_name(self.user.id), self.channel_name)

    async def receive(self, text_data: str | None = None, bytes_data: bytes | None = None) -> None:
        try:
            data = json.loads(text_data or "{}")
            if not isinstance(data, dict):
                raise TypeError
        except (ValueError, TypeError):
            await self._error("invalid_payload", "Mensagem malformada.")
            return

        handlers: dict[str, Callable[[Event], Awaitable[None]]] = {
            "thread.subscribe": self._on_subscribe,
            "thread.unsubscribe": self._on_unsubscribe,
            "message.send": self._on_send,
            "message.read": self._on_read,
            "typing": self._on_typing,
            "ping": self._on_ping,
        }
        handler = handlers.get(str(data.get("type")))
        if handler is None:
            await self._error("invalid_payload", "Tipo de evento desconhecido.")
            return

        try:
            await handler(data)
        except ThreadError as exc:
            await self._error(exc.code, exc.message)
        except ValidationError as exc:
            await self._error("invalid_payload", validation_message(exc))

    # --- handlers ----------------------------------------------------------

    async def _on_subscribe(self, data: Event) -> None:
        thread_id = str(data.get("thread_id") or "")
        thread = await self._thread_payload(thread_id)
        await self.channel_layer.group_add(group_name(thread_id), self.channel_name)
        self.subscribed.add(thread_id)
        await self._send({"type": "thread.subscribed", "thread_id": thread_id, "thread": thread})

    async def _on_unsubscribe(self, data: Event) -> None:
        thread_id = str(data.get("thread_id") or "")
        if thread_id in self.subscribed:
            await self.channel_layer.group_discard(group_name(thread_id), self.channel_name)
            self.subscribed.discard(thread_id)

    async def _on_send(self, data: Event) -> None:
        thread_id = str(data.get("thread_id") or "")
        if thread_id not in self.subscribed:
            await self._error("not_subscribed", "Assine a conversa antes de enviar.")
            return
        receiver_id, created = await self._persist(
            thread_id, data.get("content"), data.get("client_id")
        )
        if created:
            await database_sync_to_async(ChatService.push_unread)(receiver_id)

    async def _on_read(self, data: Event) -> None:
        await self._mark_read(str(data.get("thread_id") or ""), data.get("up_to"))

    async def _on_typing(self, data: Event) -> None:
        thread_id = str(data.get("thread_id") or "")
        if thread_id not in self.subscribed:
            return
        await self.channel_layer.group_send(
            group_name(thread_id),
            {
                "type": "chat.typing",
                "thread_id": thread_id,
                "user_id": str(self.user.id),
                "is_typing": bool(data.get("is_typing")),
            },
        )

    async def _on_ping(self, _data: Event) -> None:
        await self._send({"type": "pong", "server_time": iso_utc(timezone.now())})

    # --- DB helpers --------------------------------------------------------

    @database_sync_to_async
    def _thread_payload(self, thread_id: str) -> Event:
        return ThreadService.get(self.user, thread_id)

    @database_sync_to_async
    def _persist(self, thread_id: str, content: object, client_id: object) -> tuple[UUID, bool]:
        # Revalida a escrita a cada envio: o socket vive mais que o token, e a
        # regra (locação cancelada, anúncio pausado) pode ter mudado no meio.
        access = ThreadService.authorize(self.user, thread_id, write=True)
        ChatService.check_rate_limit(self.user.id)
        try:
            client_uuid = uuid.UUID(str(client_id)) if client_id else None
        except ValueError as exc:
            raise ThreadError("client_id inválido.") from exc

        receiver_id = access.peer_of(self.user.id)
        _, created = ChatService.create_message(
            sender=self.user,
            receiver_id=receiver_id,
            scope=access.scope,
            scope_id=access.scope_id,
            content=content if isinstance(content, str) else None,
            client_id=client_uuid,
            thread_id=thread_id,
        )
        return receiver_id, created

    @database_sync_to_async
    def _mark_read(self, thread_id: str, up_to: object) -> None:
        ThreadService.mark_read(self.user, thread_id, {"up_to": up_to} if up_to else {})

    # --- group event handlers ----------------------------------------------

    async def chat_message_new(self, event: Event) -> None:
        await self._send(
            {"type": "message.new", "thread_id": event["thread_id"], "message": event["message"]}
        )

    async def chat_message_read(self, event: Event) -> None:
        await self._send({k: v for k, v in event.items() if k != "type"} | {"type": "message.read"})

    async def chat_message_hidden(self, event: Event) -> None:
        await self._send(
            {
                "type": "message.hidden",
                "thread_id": event["thread_id"],
                "message_id": event["message_id"],
            }
        )

    async def chat_typing(self, event: Event) -> None:
        if event["user_id"] == str(self.user.id):
            return  # não ecoa o próprio "digitando"
        await self._send(
            {
                "type": "typing",
                "thread_id": event["thread_id"],
                "user_id": event["user_id"],
                "is_typing": event["is_typing"],
            }
        )

    async def chat_unread_updated(self, event: Event) -> None:
        await self._send(
            {
                "type": "unread.updated",
                "unread_total": event["unread_total"],
                "unread_threads": event["unread_threads"],
            }
        )

    async def chat_thread_touch(self, event: Event) -> None:
        try:
            thread = await self._thread_payload(event["thread_id"])
        except ThreadError:
            return
        await self._send({"type": "thread.updated", "thread": thread})

    # --- utils --------------------------------------------------------------

    async def _send(self, payload: Event) -> None:
        await self.send(text_data=json.dumps(payload))

    async def _error(self, code: str, message: str) -> None:
        await self._send({"type": "error", "code": code, "message": message})
