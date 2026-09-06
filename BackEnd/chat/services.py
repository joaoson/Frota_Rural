"""Único caminho de escrita do chat — usado tanto pelas views REST quanto pelo
ChatConsumer, para que as duas rotas não possam divergir em validação,
idempotência ou fan-out.
"""

import json
import time
from collections import defaultdict, deque

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import Messages
from .moderation import should_flag
from .serializer import serialize_message
from .threads import ThreadError, group_name, user_group_name

# Rate limit em memória do processo. Suficiente para o abuso acidental que ele
# existe para conter; um limite real entre workers exigiria Redis e não vale a
# dependência extra neste momento.
_recent_sends = defaultdict(deque)


def check_rate_limit(user_id):
    limit = getattr(settings, 'CHAT_RATE_LIMIT_MESSAGES', 20)
    window = getattr(settings, 'CHAT_RATE_LIMIT_WINDOW_SECONDS', 10)
    now = time.monotonic()
    bucket = _recent_sends[str(user_id)]
    while bucket and now - bucket[0] > window:
        bucket.popleft()
    if len(bucket) >= limit:
        raise ThreadError(
            'Muitas mensagens em pouco tempo. Aguarde alguns segundos.', status=429
        )
    bucket.append(now)


def create_message(*, sender, receiver_id, scope, scope_id, content, client_id, thread_id):
    """-> (payload: dict, created: bool). `created=False` é replay idempotente."""
    max_len = getattr(settings, 'CHAT_MAX_MESSAGE_LENGTH', 4000)
    content = (content or '').strip()
    if not content:
        raise ThreadError('A mensagem não pode ficar em branco.', status=400)
    if len(content) > max_len:
        raise ThreadError(f'A mensagem excede {max_len} caracteres.', status=400)

    existing = Messages.objects.filter(sender=sender, client_id=client_id).first()
    if existing is not None:
        return serialize_message(existing, thread_id=thread_id), False

    fields = {
        'sender': sender,
        'receiver_id': receiver_id,
        'content': content,
        'client_id': client_id,
        'sent_at': timezone.now(),
        'flagged_for_moderation': should_flag(content),
        'rental_id': scope_id if scope == 'rental' else None,
        'posting_id': scope_id if scope == 'posting' else None,
    }

    try:
        with transaction.atomic():
            message = Messages.objects.create(**fields)
    except IntegrityError:
        # Corrida no unique parcial (sender, client_id): outro envio idêntico
        # ganhou. Devolve o vencedor em vez de estourar.
        existing = Messages.objects.filter(sender=sender, client_id=client_id).first()
        if existing is None:
            raise
        return serialize_message(existing, thread_id=thread_id), False

    payload = serialize_message(message, thread_id=thread_id)
    fan_out_message(thread_id, payload, [str(sender.id), str(receiver_id)])
    return payload, True


def _send(group, event):
    layer = get_channel_layer()
    if layer is None:
        return
    async_to_sync(layer.group_send)(group, event)


def fan_out_message(thread_id, payload, participant_ids):
    # json.dumps aqui é a rede de proteção contra o modo de falha que só
    # apareceria com Redis: o InMemoryChannelLayer deixaria passar um UUID ou
    # datetime cru, o msgpack do channels_redis não.
    json.dumps(payload)
    _send(group_name(thread_id), {
        'type': 'chat.message.new',
        'thread_id': thread_id,
        'message': payload,
    })
    for uid in participant_ids:
        _send(user_group_name(uid), {'type': 'chat.thread.touch', 'thread_id': thread_id})


def fan_out_read(thread_id, reader_id, up_to_iso, message_ids):
    _send(group_name(thread_id), {
        'type': 'chat.message.read',
        'thread_id': thread_id,
        'reader_id': str(reader_id),
        'up_to': up_to_iso,
        'message_ids': [str(m) for m in message_ids][:500],
    })


def fan_out_hidden(thread_id, message_id):
    _send(group_name(thread_id), {
        'type': 'chat.message.hidden',
        'thread_id': thread_id,
        'message_id': str(message_id),
    })


def push_unread(user_id):
    from .selectors import unread_counts
    counts = unread_counts(user_id)
    _send(user_group_name(user_id), {'type': 'chat.unread.updated', **counts})
    return counts
