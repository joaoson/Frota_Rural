from uuid import UUID

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response

from chat.serializer import (
    ChatMessageOutputSerializer,
    MarkReadInputSerializer,
    MarkReadOutputSerializer,
    MessageFilterSerializer,
    MessagePageOutputSerializer,
    ReportMessageInputSerializer,
    SendMessageInputSerializer,
)
from chat.services import ThreadService
from chat.views.threads import TAGS, ChatAPIView
from common.request import authenticated_user
from common.schemas import MessageResponseSerializer, error_response, error_responses


class ThreadMessagesView(ChatAPIView):
    """Mesmo path para ler o histórico (GET) e enviar (POST), como no contrato."""

    @extend_schema(
        tags=TAGS,
        summary="Histórico da conversa",
        description="Paginação por keyset: `before`/`before_id` para trás, `after`/`after_id` para frente.",
        parameters=[MessageFilterSerializer],
        responses={200: MessagePageOutputSerializer, **error_responses(400, 403, 404)},
    )
    def get(self, request: Request, thread_id: str) -> Response:
        page = ThreadService.list_messages(
            authenticated_user(request), thread_id, request.query_params
        )
        return Response(MessagePageOutputSerializer(page).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Envia uma mensagem",
        description=(
            "Idempotente por `client_id`: reenviar a mesma mensagem devolve 200 com a "
            "original em vez de criar outra."
        ),
        request=SendMessageInputSerializer,
        responses={
            201: ChatMessageOutputSerializer,
            200: ChatMessageOutputSerializer,
            **error_responses(400, 403, 404, 429),
        },
    )
    def post(self, request: Request, thread_id: str) -> Response:
        message, created = ThreadService.send_message(
            authenticated_user(request), thread_id, request.data
        )
        return Response(
            ChatMessageOutputSerializer(message).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ThreadReadView(ChatAPIView):
    @extend_schema(
        tags=TAGS,
        summary="Marca a conversa como lida",
        request=MarkReadInputSerializer,
        responses={200: MarkReadOutputSerializer, **error_responses(400, 403, 404)},
    )
    def post(self, request: Request, thread_id: str) -> Response:
        result = ThreadService.mark_read(authenticated_user(request), thread_id, request.data)
        return Response(MarkReadOutputSerializer(result).data, status=status.HTTP_200_OK)


class MessageReportView(ChatAPIView):
    @extend_schema(
        tags=TAGS,
        summary="Denuncia uma mensagem",
        request=ReportMessageInputSerializer,
        responses={
            200: MessageResponseSerializer,
            **error_responses(400, 403, 404),
            409: error_response(409, "Você já denunciou esta mensagem."),
        },
    )
    def post(self, request: Request, pk: UUID) -> Response:
        ThreadService.report_message(authenticated_user(request), pk, request.data)
        return Response(
            MessageResponseSerializer(
                {"message": "Mensagem denunciada. Nossa equipe vai analisar."}
            ).data,
            status=status.HTTP_200_OK,
        )
