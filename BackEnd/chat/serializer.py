"""Serializers do chat.

As formas aqui são o contrato congelado (§3.1 do plano) — o frontend foi
construído contra elas em paralelo. Os envelopes paginados são declarados
explicitamente para o drf-spectacular, mesma técnica de `api/schemas.py`.
"""

from rest_framework import serializers

from .threads import format_thread_id


def serialize_user(user):
    if user is None:
        return None
    return {'id': str(user.id), 'name': user.name, 'role': user.role}


def serialize_message(message, thread_id=None, reveal_hidden=False):
    """Dict JSON-serializável (só primitivos).

    Só primitivos porque este mesmo payload atravessa o channel layer: o
    InMemoryChannelLayer aceitaria UUID/datetime, mas o channels_redis
    msgpack-serializa e estoura — falha que só apareceria com Redis de verdade.
    """
    hidden = message.hidden_at is not None
    if thread_id is None:
        scope = 'rental' if message.rental_id else 'posting'
        scope_id = message.rental_id or message.posting_id
        thread_id = format_thread_id(scope, scope_id, message.sender_id, message.receiver_id)
    return {
        'id': str(message.id),
        'thread_id': thread_id,
        'sender_id': str(message.sender_id),
        'receiver_id': str(message.receiver_id),
        'content': None if (hidden and not reveal_hidden) else message.content,
        'sent_at': message.sent_at.isoformat().replace('+00:00', 'Z') if message.sent_at else None,
        'read_at': message.read_at.isoformat().replace('+00:00', 'Z') if message.read_at else None,
        'flagged_for_moderation': bool(message.flagged_for_moderation),
        'hidden': hidden,
        'client_id': str(message.client_id) if message.client_id else None,
    }


# --- Entrada ---------------------------------------------------------------

class ResolveThreadSerializer(serializers.Serializer):
    scope = serializers.ChoiceField(choices=['rental', 'posting'])
    scope_id = serializers.UUIDField()
    peer_id = serializers.UUIDField(required=False)


class SendMessageSerializer(serializers.Serializer):
    content = serializers.CharField(max_length=4000, trim_whitespace=True, allow_blank=False)
    client_id = serializers.UUIDField()


class MarkReadSerializer(serializers.Serializer):
    up_to = serializers.DateTimeField(required=False)


class ReportMessageSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=1000, trim_whitespace=True, allow_blank=False)


# --- Saída (apenas para o schema OpenAPI) ----------------------------------

class ChatUserSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    role = serializers.CharField()


class ChatMessageSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    thread_id = serializers.CharField()
    sender_id = serializers.UUIDField()
    receiver_id = serializers.UUIDField()
    content = serializers.CharField(allow_null=True)
    sent_at = serializers.DateTimeField()
    read_at = serializers.DateTimeField(allow_null=True)
    flagged_for_moderation = serializers.BooleanField()
    hidden = serializers.BooleanField()
    client_id = serializers.UUIDField(allow_null=True)


class ChatThreadSerializer(serializers.Serializer):
    thread_id = serializers.CharField()
    scope = serializers.CharField()
    scope_id = serializers.UUIDField()
    scope_label = serializers.CharField()
    peer = ChatUserSerializer()
    can_write = serializers.BooleanField()
    unread_count = serializers.IntegerField()
    last_message = ChatMessageSerializer(allow_null=True)


class ThreadPageSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    limit = serializers.IntegerField()
    offset = serializers.IntegerField()
    results = ChatThreadSerializer(many=True)


class MessagePageSerializer(serializers.Serializer):
    results = ChatMessageSerializer(many=True)
    has_more = serializers.BooleanField()
    order = serializers.CharField()


class MarkReadResponseSerializer(serializers.Serializer):
    updated = serializers.IntegerField()
    read_at = serializers.DateTimeField()
    unread_total = serializers.IntegerField()


class UnreadCountsSerializer(serializers.Serializer):
    unread_total = serializers.IntegerField()
    unread_threads = serializers.IntegerField()
