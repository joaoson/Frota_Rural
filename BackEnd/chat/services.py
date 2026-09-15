"""Único caminho de escrita e de leitura autorizada do chat.

Usado tanto pelas views REST quanto pelo ChatConsumer, para que as duas rotas
não possam divergir em validação, autorização, idempotência ou fan-out.
"""

import json
import time
import uuid
from collections import defaultdict, deque
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Q, QuerySet
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from chat import selectors
from chat.models import MessageReports, Messages
from chat.moderation import should_flag
from chat.serializer import (
    InboxFilterSerializer,
    MarkReadInputSerializer,
    MessageFilterSerializer,
    MessageLike,
    ReportMessageInputSerializer,
    ResolveThreadInputSerializer,
    SendMessageInputSerializer,
    iso_utc,
    serialize_message,
    serialize_user,
)
from chat.threads import (
    SCOPE_POSTING,
    SCOPE_RENTAL,
    ScopeObject,
    ThreadError,
    can_read,
    can_write,
    can_write_bool,
    format_thread_id,
    group_name,
    is_admin,
    load_scope,
    parse_thread_id,
    posting_owner_id,
    rental_participants,
    user_group_name,
)
from postings.models import Postings
from rentals.models import Rentals
from users.models import Users

# Rate limit em memória do processo. Suficiente para o abuso acidental que ele
# existe para conter; um limite real entre workers exigiria Redis e não vale a
# dependência extra neste momento.
_recent_sends: defaultdict[str, deque[float]] = defaultdict(deque)

# Teto de ids por evento de leitura no channel layer.
MAX_READ_RECEIPT_IDS = 500


@dataclass(frozen=True)
class ThreadAccess:
    """Thread já validada e com o escopo (locação ou anúncio) carregado."""

    thread_id: str
    scope: str
    scope_id: UUID
    lo: UUID
    hi: UUID
    scope_obj: ScopeObject

    @property
    def participants(self) -> set[str]:
        return {str(self.lo), str(self.hi)}

    def peer_of(self, user_id: UUID) -> UUID:
        return self.hi if str(self.lo) == str(user_id) else self.lo

    def messages(self) -> QuerySet[Messages]:
        return ThreadService.messages_between(self.scope, self.scope_id, self.lo, self.hi)


class ChatService:
    """Escrita de mensagens e eventos em tempo real."""

    @staticmethod
    def check_rate_limit(user_id: UUID | str) -> None:
        limit: int = getattr(settings, "CHAT_RATE_LIMIT_MESSAGES", 20)
        window: int = getattr(settings, "CHAT_RATE_LIMIT_WINDOW_SECONDS", 10)
        now = time.monotonic()
        bucket = _recent_sends[str(user_id)]
        while bucket and now - bucket[0] > window:
            bucket.popleft()
        if len(bucket) >= limit:
            raise ThreadError(
                "Muitas mensagens em pouco tempo. Aguarde alguns segundos.", status=429
            )
        bucket.append(now)

    @staticmethod
    def create_message(
        *,
        sender: Users,
        receiver_id: UUID,
        scope: str,
        scope_id: UUID,
        content: str | None,
        client_id: UUID | str | None,
        thread_id: str,
    ) -> tuple[dict[str, Any], bool]:
        """-> (payload, created). `created=False` é replay idempotente do mesmo `client_id`."""
        max_len: int = getattr(settings, "CHAT_MAX_MESSAGE_LENGTH", 4000)
        content = (content or "").strip()
        if not content:
            raise ThreadError("A mensagem não pode ficar em branco.")
        if len(content) > max_len:
            raise ThreadError(f"A mensagem excede {max_len} caracteres.")

        if client_id:
            existing = Messages.objects.filter(sender=sender, client_id=client_id).first()
            if existing is not None:
                return serialize_message(existing, thread_id=thread_id), False

        try:
            with transaction.atomic():
                message = Messages.objects.create(
                    sender=sender,
                    receiver_id=receiver_id,
                    content=content,
                    client_id=client_id,
                    sent_at=timezone.now(),
                    flagged_for_moderation=should_flag(content),
                    rental_id=scope_id if scope == SCOPE_RENTAL else None,
                    posting_id=scope_id if scope == SCOPE_POSTING else None,
                )
        except IntegrityError:
            # Corrida no unique parcial (sender, client_id): outro envio idêntico
            # ganhou. Devolve o vencedor em vez de estourar.
            existing = Messages.objects.filter(sender=sender, client_id=client_id).first()
            if existing is None:
                raise
            return serialize_message(existing, thread_id=thread_id), False

        payload = serialize_message(message, thread_id=thread_id)
        ChatService.fan_out_message(thread_id, payload, [str(sender.id), str(receiver_id)])
        return payload, True

    @staticmethod
    def fan_out_message(
        thread_id: str, payload: dict[str, Any], participant_ids: Iterable[str]
    ) -> None:
        # json.dumps aqui é a rede de proteção contra o modo de falha que só
        # apareceria com Redis: o InMemoryChannelLayer deixaria passar um UUID ou
        # datetime cru, o msgpack do channels_redis não.
        json.dumps(payload)
        ChatService._send(
            group_name(thread_id),
            {"type": "chat.message.new", "thread_id": thread_id, "message": payload},
        )
        for user_id in participant_ids:
            ChatService._send(
                user_group_name(user_id), {"type": "chat.thread.touch", "thread_id": thread_id}
            )

    @staticmethod
    def fan_out_read(
        thread_id: str, reader_id: UUID | str, up_to_iso: str, message_ids: Iterable[UUID]
    ) -> None:
        ChatService._send(
            group_name(thread_id),
            {
                "type": "chat.message.read",
                "thread_id": thread_id,
                "reader_id": str(reader_id),
                "up_to": up_to_iso,
                "message_ids": [str(m) for m in message_ids][:MAX_READ_RECEIPT_IDS],
            },
        )

    @staticmethod
    def fan_out_hidden(thread_id: str, message_id: UUID | str) -> None:
        ChatService._send(
            group_name(thread_id),
            {"type": "chat.message.hidden", "thread_id": thread_id, "message_id": str(message_id)},
        )

    @staticmethod
    def push_unread(user_id: UUID | str) -> dict[str, int]:
        counts = selectors.unread_counts(user_id)
        ChatService._send(user_group_name(user_id), {"type": "chat.unread.updated", **counts})
        return counts

    @staticmethod
    def _send(group: str, event: dict[str, Any]) -> None:
        layer = get_channel_layer()
        if layer is None:
            return
        async_to_sync(layer.group_send)(group, event)


class ThreadService:
    """Leitura autorizada de conversas e as ações de um participante."""

    @staticmethod
    def messages_between(scope: str, scope_id: UUID, lo: UUID, hi: UUID) -> QuerySet[Messages]:
        field = "rental_id" if scope == SCOPE_RENTAL else "posting_id"
        pair = Q(sender_id=lo, receiver_id=hi) | Q(sender_id=hi, receiver_id=lo)
        return Messages.objects.filter(**{field: scope_id}).filter(pair)

    @staticmethod
    def open(thread_id: str) -> ThreadAccess:
        """Valida a chave e carrega o escopo, sem checar permissão."""
        scope, scope_id, lo, hi = parse_thread_id(thread_id)
        return ThreadAccess(thread_id, scope, scope_id, lo, hi, load_scope(scope, scope_id))

    @staticmethod
    def authorize(user: Users, thread_id: str, *, write: bool = False) -> ThreadAccess:
        """Levanta ThreadError se o usuário não pode ler (ou escrever) na thread."""
        access = ThreadService.open(thread_id)
        if write:
            can_write(
                user,
                access.scope,
                access.scope_obj,
                access.participants,
                access.messages().exists(),
            )
        else:
            can_read(user, access.scope, access.scope_obj, access.participants)
        return access

    @staticmethod
    def payload(
        user: Users,
        access: ThreadAccess,
        *,
        unread_count: int | None = None,
        last_message: MessageLike | None = None,
    ) -> dict[str, Any]:
        """Resumo da thread no formato do inbox (`ChatThreadOutputSerializer`)."""
        messages = access.messages()
        has_messages = last_message is not None or messages.exists()
        if unread_count is None:
            unread_count = messages.filter(receiver=user, read_at__isnull=True).count()
        if last_message is None:
            last_message = messages.order_by("-sent_at", "-id").first()
        peer = Users.objects.filter(id=access.peer_of(user.id)).first()
        return {
            "thread_id": access.thread_id,
            "scope": access.scope,
            "scope_id": str(access.scope_id),
            "scope_label": ThreadService._scope_label(access.scope_obj),
            "peer": serialize_user(peer),
            "can_write": can_write_bool(
                user, access.scope, access.scope_obj, access.participants, has_messages
            ),
            "unread_count": unread_count,
            "last_message": (
                serialize_message(
                    last_message, thread_id=access.thread_id, reveal_hidden=is_admin(user)
                )
                if last_message is not None
                else None
            ),
        }

    @staticmethod
    def resolve(user: Users, data: Mapping[str, Any]) -> dict[str, Any]:
        """Abre ou localiza a conversa do usuário com o outro participante do escopo.

        Idempotente: não cria nada, só resolve o thread_id do par.
        """
        serializer = ResolveThreadInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        scope: str = serializer.validated_data["scope"]
        scope_id: UUID = serializer.validated_data["scope_id"]
        peer_id: UUID | None = serializer.validated_data.get("peer_id")

        scope_obj = load_scope(scope, scope_id)
        if peer_id is None:
            peer_id = ThreadService._derive_peer(user, scope_obj)
        thread_id = format_thread_id(scope, scope_id, user.id, peer_id)
        _, _, lo, hi = parse_thread_id(thread_id)
        access = ThreadAccess(thread_id, scope, scope_id, lo, hi, scope_obj)
        can_read(user, scope, scope_obj, access.participants)
        return ThreadService.payload(user, access)

    @staticmethod
    def get(user: Users, thread_id: str) -> dict[str, Any]:
        return ThreadService.payload(user, ThreadService.authorize(user, thread_id))

    @staticmethod
    def inbox(user: Users, filters: Mapping[str, Any]) -> dict[str, Any]:
        serializer = InboxFilterSerializer(data=filters)
        serializer.is_valid(raise_exception=True)
        limit: int = serializer.validated_data["limit"]
        offset: int = serializer.validated_data["offset"]

        rows, total = selectors.inbox_page(
            user.id, limit=limit, offset=offset, scope=serializer.validated_data.get("scope")
        )
        results = []
        for row in rows:
            try:
                access = ThreadAccess(
                    row.thread_id,
                    row.scope,
                    row.scope_id,
                    row.peer_lo,
                    row.peer_hi,
                    load_scope(row.scope, row.scope_id),
                )
            except ThreadError:
                # Escopo apagado sob os pés (locação/anúncio removido): a thread
                # some do inbox em vez de derrubar a listagem inteira.
                continue
            results.append(
                ThreadService.payload(
                    user, access, unread_count=row.unread_count, last_message=row.last_message
                )
            )
        return {"count": total, "limit": limit, "offset": offset, "results": results}

    @staticmethod
    def list_messages(user: Users, thread_id: str, filters: Mapping[str, Any]) -> dict[str, Any]:
        access = ThreadService.authorize(user, thread_id)
        serializer = MessageFilterSerializer(data=filters)
        serializer.is_valid(raise_exception=True)
        params: dict[str, Any] = serializer.validated_data
        limit: int = params["limit"]

        messages = access.messages()
        if "after" in params:
            messages = messages.filter(
                Q(sent_at__gt=params["after"])
                | Q(sent_at=params["after"], id__gt=params["after_id"])
            )
            order, ordering = "asc", ("sent_at", "id")
        else:
            if "before" in params:
                messages = messages.filter(
                    Q(sent_at__lt=params["before"])
                    | Q(sent_at=params["before"], id__lt=params["before_id"])
                )
            order, ordering = "desc", ("-sent_at", "-id")

        rows = [*messages.order_by(*ordering)[: limit + 1]]
        reveal = is_admin(user)
        return {
            "results": [
                serialize_message(m, thread_id=thread_id, reveal_hidden=reveal)
                for m in rows[:limit]
            ],
            "has_more": len(rows) > limit,
            "order": order,
        }

    @staticmethod
    def send_message(
        user: Users, thread_id: str, data: Mapping[str, Any]
    ) -> tuple[dict[str, Any], bool]:
        """-> (payload, created). Avisa o destinatário do novo total de não lidas."""
        serializer = SendMessageInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        access = ThreadService.authorize(user, thread_id, write=True)
        ChatService.check_rate_limit(user.id)

        receiver_id = access.peer_of(user.id)
        payload, created = ChatService.create_message(
            sender=user,
            receiver_id=receiver_id,
            scope=access.scope,
            scope_id=access.scope_id,
            content=serializer.validated_data["content"],
            client_id=serializer.validated_data["client_id"],
            thread_id=thread_id,
        )
        if created:
            ChatService.push_unread(receiver_id)
        return payload, created

    @staticmethod
    def mark_read(user: Users, thread_id: str, data: Mapping[str, Any]) -> dict[str, Any]:
        serializer = MarkReadInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        access = ThreadService.authorize(user, thread_id)

        now = timezone.now()
        pending = access.messages().filter(receiver=user, read_at__isnull=True)
        up_to = serializer.validated_data.get("up_to")
        if up_to:
            pending = pending.filter(sent_at__lte=up_to)
        ids = [*pending.values_list("id", flat=True)[:MAX_READ_RECEIPT_IDS]]
        updated = pending.update(read_at=now)

        read_at = iso_utc(now) or ""
        if updated:
            ChatService.fan_out_read(thread_id, user.id, read_at, ids)
        counts = ChatService.push_unread(user.id)
        return {"updated": updated, "read_at": read_at, "unread_total": counts["unread_total"]}

    @staticmethod
    def unread(user: Users) -> dict[str, int]:
        return selectors.unread_counts(user.id)

    @staticmethod
    @transaction.atomic
    def report_message(user: Users, message_id: UUID, data: Mapping[str, Any]) -> None:
        serializer = ReportMessageInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)

        message = Messages.objects.filter(id=message_id).first()
        if message is None:
            raise ThreadError("Mensagem não encontrada.", status=404)
        user_id = str(user.id)
        if user_id not in (str(message.sender_id), str(message.receiver_id)):
            raise ThreadError("Você não participa desta conversa.", status=403)
        if user_id == str(message.sender_id):
            raise ThreadError("Você não pode denunciar a própria mensagem.", status=403)
        if MessageReports.objects.filter(message=message, reported_by=user).exists():
            raise ThreadError("Você já denunciou esta mensagem.", status=409)

        MessageReports.objects.create(
            message=message, reported_by=user, reason=serializer.validated_data["reason"]
        )
        Messages.objects.filter(id=message.id).update(flagged_for_moderation=True)

    @staticmethod
    def _scope_label(scope_obj: ScopeObject) -> str:
        posting: Postings | None = (
            getattr(scope_obj, "postings", None) if isinstance(scope_obj, Rentals) else scope_obj
        )
        machinery = getattr(posting, "machinery", None) if posting else None
        if machinery:
            label = f"{machinery.brand or ''} {machinery.model or ''}".strip()
            if label:
                return label
        if isinstance(scope_obj, Rentals):
            return f"Locação #{str(scope_obj.id)[:8].upper()}"
        return "Anúncio"

    @staticmethod
    def _derive_peer(user: Users, scope_obj: ScopeObject) -> UUID:
        if isinstance(scope_obj, Postings):
            owner_id = posting_owner_id(scope_obj)
            if owner_id is None:
                raise ThreadError("Anúncio não encontrado.", status=404)
            if str(owner_id) == str(user.id):
                raise ThreadError("Informe com qual usuário deseja conversar.")
            return owner_id
        others = rental_participants(scope_obj) - {str(user.id)}
        if len(others) != 1:
            raise ThreadError("Informe com qual participante da locação deseja conversar.")
        return uuid.UUID(next(iter(others)))


def validation_message(exc: ValidationError) -> str:
    """Primeira mensagem de um ValidationError, para o evento `error` do WebSocket."""
    detail: Any = exc.detail
    while isinstance(detail, dict | list) and detail:
        detail = next(iter(detail.values())) if isinstance(detail, dict) else detail[0]
    return str(detail) if detail else "Dados inválidos."
