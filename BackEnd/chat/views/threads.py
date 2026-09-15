from collections.abc import Sequence

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from chat.serializer import (
    ChatThreadOutputSerializer,
    InboxFilterSerializer,
    ResolveThreadInputSerializer,
    ThreadPageOutputSerializer,
    UnreadCountsOutputSerializer,
)
from chat.services import ThreadService
from common.request import authenticated_user
from common.schemas import error_responses

TAGS = ["Mensagens"]


class ChatAPIView(APIView):
    """Todo endpoint do chat exige usuário autenticado."""

    permission_classes: Sequence[type[BasePermission]] = (IsAuthenticated,)


class ThreadResolveView(ChatAPIView):
    @extend_schema(
        tags=TAGS,
        summary="Abre ou localiza uma conversa",
        description="Idempotente: não cria nada, apenas resolve o thread_id do par.",
        request=ResolveThreadInputSerializer,
        responses={200: ChatThreadOutputSerializer, **error_responses(400, 403, 404)},
    )
    def post(self, request: Request) -> Response:
        thread = ThreadService.resolve(authenticated_user(request), request.data)
        return Response(ChatThreadOutputSerializer(thread).data, status=status.HTTP_200_OK)


class ThreadListView(ChatAPIView):
    @extend_schema(
        tags=TAGS,
        summary="Lista as conversas do usuário (inbox)",
        operation_id="chat_threads_list",
        parameters=[InboxFilterSerializer],
        responses={200: ThreadPageOutputSerializer, **error_responses(400)},
    )
    def get(self, request: Request) -> Response:
        page = ThreadService.inbox(authenticated_user(request), request.query_params)
        return Response(ThreadPageOutputSerializer(page).data, status=status.HTTP_200_OK)


class ThreadDetailView(ChatAPIView):
    @extend_schema(
        tags=TAGS,
        summary="Busca uma conversa pelo thread_id",
        operation_id="chat_threads_retrieve",
        description=(
            "O inbox é derivado da tabela de mensagens, então uma conversa recém-"
            "aberta (zero mensagens) não aparece em GET /chat/threads/. Este "
            "endpoint existe para abrir uma conversa por link direto sem que o "
            "cliente precise interpretar o thread_id."
        ),
        responses={200: ChatThreadOutputSerializer, **error_responses(400, 403, 404)},
    )
    def get(self, request: Request, thread_id: str) -> Response:
        thread = ThreadService.get(authenticated_user(request), thread_id)
        return Response(ChatThreadOutputSerializer(thread).data, status=status.HTTP_200_OK)


class UnreadCountView(ChatAPIView):
    @extend_schema(
        tags=TAGS,
        summary="Contadores de não lidas para o badge",
        responses={200: UnreadCountsOutputSerializer},
    )
    def get(self, request: Request) -> Response:
        counts = ThreadService.unread(authenticated_user(request))
        return Response(UnreadCountsOutputSerializer(counts).data, status=status.HTTP_200_OK)
