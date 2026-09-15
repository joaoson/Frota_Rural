"""Serializers do chat.

As formas aqui são o contrato congelado (§3.1 do plano) — o frontend foi
construído contra elas em paralelo.
"""

from datetime import datetime
from typing import Any, Protocol
from uuid import UUID

from rest_framework import serializers

from chat.enums import ThreadScope
from chat.threads import format_thread_id
from users.enums import UserRole
from users.models import Users

MAX_MESSAGE_LENGTH = 4000


class MessageLike(Protocol):
    """O que `serialize_message` lê: um `Messages` ou a linha crua do inbox."""

    @property
    def id(self) -> UUID: ...
    @property
    def sender_id(self) -> UUID: ...
    @property
    def receiver_id(self) -> UUID: ...
    @property
    def rental_id(self) -> UUID | None: ...
    @property
    def posting_id(self) -> UUID | None: ...
    @property
    def content(self) -> str: ...
    @property
    def sent_at(self) -> datetime | None: ...
    @property
    def read_at(self) -> datetime | None: ...
    @property
    def hidden_at(self) -> datetime | None: ...
    @property
    def flagged_for_moderation(self) -> bool: ...
    @property
    def client_id(self) -> UUID | None: ...


def iso_utc(value: datetime | None) -> str | None:
    """ISO 8601 com `Z`, o formato que o front usa como cursor de paginação."""
    return value.isoformat().replace("+00:00", "Z") if value else None


def serialize_user(user: Users | None) -> dict[str, str] | None:
    if user is None:
        return None
    return {"id": str(user.id), "name": user.name, "role": user.role}


def serialize_message(
    message: MessageLike, thread_id: str | None = None, reveal_hidden: bool = False
) -> dict[str, Any]:
    """Dict JSON-serializável (só primitivos).

    Só primitivos porque este mesmo payload atravessa o channel layer: o
    InMemoryChannelLayer aceitaria UUID/datetime, mas o channels_redis
    msgpack-serializa e estoura — falha que só apareceria com Redis de verdade.
    """
    hidden = message.hidden_at is not None
    if thread_id is None:
        scope = ThreadScope.RENTAL if message.rental_id else ThreadScope.POSTING
        scope_id = message.rental_id or message.posting_id
        assert scope_id is not None  # garantido pela CheckConstraint do model
        thread_id = format_thread_id(scope, scope_id, message.sender_id, message.receiver_id)
    return {
        "id": str(message.id),
        "thread_id": thread_id,
        "sender_id": str(message.sender_id),
        "receiver_id": str(message.receiver_id),
        "content": None if (hidden and not reveal_hidden) else message.content,
        "sent_at": iso_utc(message.sent_at),
        "read_at": iso_utc(message.read_at),
        "flagged_for_moderation": bool(message.flagged_for_moderation),
        "hidden": hidden,
        "client_id": str(message.client_id) if message.client_id else None,
    }


# --- Entrada ---------------------------------------------------------------


class ResolveThreadInputSerializer(serializers.Serializer[Any]):
    scope = serializers.ChoiceField(choices=ThreadScope.choices)
    scope_id = serializers.UUIDField()
    peer_id = serializers.UUIDField(required=False)


class SendMessageInputSerializer(serializers.Serializer[Any]):
    content = serializers.CharField(
        max_length=MAX_MESSAGE_LENGTH, trim_whitespace=True, allow_blank=False
    )
    client_id = serializers.UUIDField(
        help_text="Gerado pelo cliente antes do envio; garante idempotência."
    )


class MarkReadInputSerializer(serializers.Serializer[Any]):
    up_to = serializers.DateTimeField(required=False)


class ReportMessageInputSerializer(serializers.Serializer[Any]):
    reason = serializers.CharField(max_length=1000, trim_whitespace=True, allow_blank=False)


class InboxFilterSerializer(serializers.Serializer[Any]):
    limit = serializers.IntegerField(required=False, default=20, min_value=1, max_value=50)
    offset = serializers.IntegerField(required=False, default=0, min_value=0)
    scope = serializers.ChoiceField(choices=ThreadScope.choices, required=False)


class MessageFilterSerializer(serializers.Serializer[Any]):
    """Cursor de keyset: `before`/`before_id` para trás, `after`/`after_id` para frente."""

    limit = serializers.IntegerField(required=False, default=50, min_value=1, max_value=200)
    before = serializers.DateTimeField(required=False)
    before_id = serializers.UUIDField(required=False)
    after = serializers.DateTimeField(required=False)
    after_id = serializers.UUIDField(required=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if "before" in attrs and "before_id" not in attrs:
            raise serializers.ValidationError({"before_id": "Informe before_id junto de before."})
        if "after" in attrs and "after_id" not in attrs:
            raise serializers.ValidationError({"after_id": "Informe after_id junto de after."})
        return attrs


# --- Saída -----------------------------------------------------------------


class ChatUserOutputSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    name = serializers.CharField()
    role = serializers.ChoiceField(choices=UserRole.choices)


class ChatMessageOutputSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    thread_id = serializers.CharField()
    sender_id = serializers.UUIDField()
    receiver_id = serializers.UUIDField()
    content = serializers.CharField(
        allow_null=True, help_text="`null` quando a mensagem foi ocultada."
    )
    sent_at = serializers.DateTimeField()
    read_at = serializers.DateTimeField(allow_null=True)
    flagged_for_moderation = serializers.BooleanField()
    hidden = serializers.BooleanField()
    client_id = serializers.UUIDField(allow_null=True)


class ChatThreadOutputSerializer(serializers.Serializer[Any]):
    thread_id = serializers.CharField()
    scope = serializers.ChoiceField(choices=ThreadScope.choices)
    scope_id = serializers.UUIDField()
    scope_label = serializers.CharField()
    peer = ChatUserOutputSerializer(allow_null=True)
    can_write = serializers.BooleanField()
    unread_count = serializers.IntegerField()
    last_message = ChatMessageOutputSerializer(allow_null=True)


class ThreadPageOutputSerializer(serializers.Serializer[Any]):
    count = serializers.IntegerField()
    limit = serializers.IntegerField()
    offset = serializers.IntegerField()
    results = ChatThreadOutputSerializer(many=True)


class MessagePageOutputSerializer(serializers.Serializer[Any]):
    results = ChatMessageOutputSerializer(many=True)
    has_more = serializers.BooleanField()
    order = serializers.ChoiceField(choices=[("asc", "Crescente"), ("desc", "Decrescente")])


class MarkReadOutputSerializer(serializers.Serializer[Any]):
    updated = serializers.IntegerField()
    read_at = serializers.DateTimeField()
    unread_total = serializers.IntegerField()


class UnreadCountsOutputSerializer(serializers.Serializer[Any]):
    unread_total = serializers.IntegerField()
    unread_threads = serializers.IntegerField()
