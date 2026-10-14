from collections.abc import Sequence
from uuid import UUID

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from administration.permissions import IsPlatformAdmin
from administration.serializer import (
    ChatModerationFilterSerializer,
    MessageModerationDecisionInputSerializer,
    ModerationQueuePageOutputSerializer,
)
from administration.services import ChatModerationService
from chat.enums import ModerationDecision
from common.request import optional_user
from common.schemas import MessageResponseSerializer, error_response, error_responses

TAGS = ["Administração"]

DECISION_MESSAGES = {
    ModerationDecision.HIDE: "Mensagem ocultada da conversa.",
    ModerationDecision.DISMISS: "Denúncia arquivada.",
}


class ChatModerationView(APIView):
    permission_classes: Sequence[type[BasePermission]] = (IsAuthenticated, IsPlatformAdmin)


class ChatModerationQueueView(ChatModerationView):
    @extend_schema(
        tags=TAGS,
        summary="Fila de moderação de mensagens",
        description="Mensagens denunciadas por usuários ou sinalizadas por palavra bloqueada.",
        parameters=[ChatModerationFilterSerializer],
        responses={200: ModerationQueuePageOutputSerializer, **error_responses(400, 403)},
    )
    def get(self, request: Request) -> Response:
        page = ChatModerationService.queue(request.query_params)
        return Response(ModerationQueuePageOutputSerializer(page).data, status=status.HTTP_200_OK)


class ChatModerationResolveView(ChatModerationView):
    @extend_schema(
        tags=TAGS,
        summary="Decide sobre uma mensagem denunciada",
        request=MessageModerationDecisionInputSerializer,
        responses={
            200: MessageResponseSerializer,
            **error_responses(400, 403),
            404: error_response(404, "Mensagem não encontrada."),
        },
    )
    def put(self, request: Request, pk: UUID) -> Response:
        decision = ChatModerationService.resolve(pk, request.data, moderator=optional_user(request))
        return Response(
            MessageResponseSerializer({"message": DECISION_MESSAGES[decision]}).data,
            status=status.HTTP_200_OK,
        )
