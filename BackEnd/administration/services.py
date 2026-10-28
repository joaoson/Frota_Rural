from collections.abc import Mapping
from typing import Any
from uuid import UUID

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from administration.enums import ModerationAction, ModerationQueueSource, ModerationQueueStatus
from administration.models import PostingModeration
from administration.serializer import (
    ChatModerationFilterSerializer,
    MessageModerationDecisionInputSerializer,
    PostingRejectionInputSerializer,
)
from chat.enums import ModerationDecision, ReportResolution, ThreadScope
from chat.models import MessageReports, Messages
from chat.serializer import iso_utc, serialize_message, serialize_user
from chat.services import ChatService
from chat.threads import format_thread_id
from contracts.enums import ContractStatus
from contracts.models import Contracts
from postings.enums import PostingStatus
from postings.models import Postings
from rentals.enums import RentalStatus
from rentals.models import Rentals
from users.enums import DISABLED_STATUSES, UserStatus
from users.models import Users


class UserModerationService:
    """Advertência, suspensão e banimento, cada um com seus efeitos na operação."""

    @staticmethod
    def _lock_user(user_id: UUID) -> Users:
        try:
            return Users.objects.select_for_update().get(id=user_id)
        except Users.DoesNotExist as exc:
            raise NotFound("Usuário não encontrado.") from exc

    @staticmethod
    def _set_status(user: Users, status: UserStatus) -> None:
        user.status = status
        user.save(update_fields=["status", "updated_at"])

    @staticmethod
    @transaction.atomic
    def warn(user_id: UUID) -> Users:
        """Aviso formal: não mexe em anúncios nem locações."""
        user = UserModerationService._lock_user(user_id)
        if user.status in DISABLED_STATUSES:
            label = UserStatus(user.status).label.lower()
            raise ValidationError(f"Usuário já está {label}.")
        UserModerationService._set_status(user, UserStatus.WARNED)
        return user

    @staticmethod
    @transaction.atomic
    def suspend(user_id: UUID) -> Users:
        """Suspende a conta, pausa os anúncios ativos e cancela as reservas pendentes."""
        user = UserModerationService._lock_user(user_id)
        if user.status == UserStatus.BANNED:
            raise ValidationError("Usuário já está banido.")

        UserModerationService._set_status(user, UserStatus.SUSPENDED)
        Postings.objects.filter(machinery__owner=user, status=PostingStatus.ACTIVE).update(
            status=PostingStatus.SUSPENDED
        )
        rental_ids = list(Rentals.objects.filter(lessee=user, status=RentalStatus.PENDING).values_list("id", flat=True))
        Rentals.objects.filter(id__in=rental_ids).update(status=RentalStatus.CANCELLED)
        Contracts.objects.filter(rental_id__in=rental_ids, status=ContractStatus.PENDING_SIGNATURES).update(status=ContractStatus.CANCELLED)
        return user

    @staticmethod
    @transaction.atomic
    def ban(user_id: UUID) -> Users:
        """Bane a conta e desfaz tudo que ainda está em andamento em nome dela."""
        user = UserModerationService._lock_user(user_id)
        UserModerationService._set_status(user, UserStatus.BANNED)

        Postings.objects.filter(machinery__owner=user).exclude(
            status=PostingStatus.INACTIVE
        ).update(status=PostingStatus.INACTIVE)

        # Materializado antes do update: como queryset preguiçosa, a lista seria
        # reavaliada depois de as locações já estarem canceladas e voltaria vazia,
        # deixando os contratos pendentes para trás.
        rental_ids = [
            *Rentals.objects.filter(
                lessee=user, status__in=(RentalStatus.PENDING, RentalStatus.ACTIVE)
            ).values_list("id", flat=True)
        ]
        Rentals.objects.filter(id__in=rental_ids).update(status=RentalStatus.CANCELLED)
        Contracts.objects.filter(
            rental_id__in=rental_ids, status=ContractStatus.PENDING_SIGNATURES
        ).update(status=ContractStatus.CANCELLED)
        return user


class PostingModerationService:
    """Moderação de anúncios (RF17), sempre registrada no histórico."""

    @staticmethod
    def _lock_posting(posting_id: UUID) -> Postings:
        try:
            return Postings.objects.select_for_update().get(id=posting_id)
        except Postings.DoesNotExist as exc:
            raise NotFound("Anúncio não encontrado.") from exc

    @staticmethod
    @transaction.atomic
    def approve(posting_id: UUID, *, moderator: Users | None) -> Postings:
        posting = PostingModerationService._lock_posting(posting_id)
        posting.status = PostingStatus.ACTIVE
        posting.updated_at = timezone.now()
        posting.save(update_fields=["status", "updated_at"])
        PostingModeration.objects.create(
            posting=posting, moderator=moderator, action=ModerationAction.APPROVED
        )
        return posting

    @staticmethod
    @transaction.atomic
    def reject(posting_id: UUID, data: Mapping[str, Any], *, moderator: Users | None) -> Postings:
        serializer = PostingRejectionInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)

        posting = PostingModerationService._lock_posting(posting_id)
        posting.status = PostingStatus.REJECTED
        posting.updated_at = timezone.now()
        posting.save(update_fields=["status", "updated_at"])
        PostingModeration.objects.create(
            posting=posting,
            moderator=moderator,
            action=ModerationAction.REJECTED,
            reason=serializer.validated_data["reason"],
        )
        return posting


class ChatModerationService:
    """Fila de mensagens denunciadas ou sinalizadas e a decisão sobre elas."""

    @staticmethod
    def queue(filters: Mapping[str, Any]) -> dict[str, Any]:
        serializer = ChatModerationFilterSerializer(data=filters)
        serializer.is_valid(raise_exception=True)
        params: dict[str, Any] = serializer.validated_data
        limit: int = params["limit"]
        offset: int = params["offset"]

        messages = Messages.objects.filter(flagged_for_moderation=True)
        if params["status"] == ModerationQueueStatus.PENDING:
            messages = messages.filter(
                hidden_at__isnull=True, reports__resolution__isnull=True
            ).distinct()
        elif params["status"] == ModerationQueueStatus.RESOLVED:
            messages = messages.filter(hidden_at__isnull=False).distinct()

        if params["source"] == ModerationQueueSource.REPORT:
            messages = messages.filter(reports__isnull=False).distinct()
        elif params["source"] == ModerationQueueSource.AUTO:
            messages = messages.filter(reports__isnull=True)

        total = messages.count()
        page = messages.select_related("sender", "receiver").order_by("-sent_at")[
            offset : offset + limit
        ]
        return {
            "count": total,
            "limit": limit,
            "offset": offset,
            "results": [ChatModerationService._queue_item(message) for message in page],
        }

    @staticmethod
    @transaction.atomic
    def resolve(
        message_id: UUID, data: Mapping[str, Any], *, moderator: Users | None
    ) -> ModerationDecision:
        """Oculta a mensagem (denúncias procedentes) ou arquiva as denúncias."""
        serializer = MessageModerationDecisionInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        decision = ModerationDecision(serializer.validated_data["decision"])
        note: str | None = serializer.validated_data.get("note") or None

        message = Messages.objects.select_for_update().filter(id=message_id).first()
        if message is None:
            raise NotFound("Mensagem não encontrada.")

        now = timezone.now()
        open_reports = MessageReports.objects.filter(message=message, resolution__isnull=True)
        resolution_fields = {"resolution_note": note, "resolved_by": moderator, "resolved_at": now}

        if decision == ModerationDecision.HIDE:
            Messages.objects.filter(id=message.id).update(
                hidden_at=now, flagged_for_moderation=True
            )
            open_reports.update(resolution=ReportResolution.UPHELD, **resolution_fields)
            thread_id = ChatModerationService._thread_id(message)
            # Só avisa os sockets depois do commit: se a transação desfizer, a
            # mensagem não pode ter sumido da tela de ninguém.
            transaction.on_commit(lambda: ChatService.fan_out_hidden(thread_id, message.id))
        else:
            Messages.objects.filter(id=message.id).update(flagged_for_moderation=False)
            open_reports.update(resolution=ReportResolution.DISMISSED, **resolution_fields)
        return decision

    @staticmethod
    def _thread_id(message: Messages) -> str:
        scope = ThreadScope.RENTAL if message.rental_id else ThreadScope.POSTING
        scope_id = message.rental_id or message.posting_id
        assert scope_id is not None  # garantido pela CheckConstraint do model
        return format_thread_id(scope, scope_id, message.sender_id, message.receiver_id)

    @staticmethod
    def _queue_item(message: Messages) -> dict[str, Any]:
        reports = [*message.reports.select_related("reported_by", "resolved_by")]
        payload = serialize_message(
            message, thread_id=ChatModerationService._thread_id(message), reveal_hidden=True
        )
        return {
            "message_id": payload["id"],
            "thread_id": payload["thread_id"],
            "content": payload["content"],
            "sent_at": payload["sent_at"],
            "hidden": payload["hidden"],
            "sender": serialize_user(message.sender),
            "receiver": serialize_user(message.receiver),
            "source": ModerationQueueSource.REPORT if reports else ModerationQueueSource.AUTO,
            "reports": [
                {
                    "id": str(report.id),
                    "reason": report.reason,
                    "reported_by": serialize_user(report.reported_by),
                    "created_at": iso_utc(report.created_at),
                    "resolution": report.resolution,
                    "resolved_at": iso_utc(report.resolved_at),
                    "resolved_by": serialize_user(report.resolved_by),
                }
                for report in reports
            ],
        }
