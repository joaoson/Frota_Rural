from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response

from authentication.serializer import (
    PasswordResetConfirmInputSerializer,
    PasswordResetRequestInputSerializer,
)
from authentication.services import PasswordResetService
from authentication.views.tokens import TAGS, PublicAuthView
from common.schemas import MessageResponseSerializer, error_response, error_responses

RESET_REQUESTED_MESSAGE = (
    "Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha."
)
PASSWORD_UPDATED_MESSAGE = "Senha atualizada com sucesso."


class PasswordResetRequestView(PublicAuthView):
    @extend_schema(
        tags=TAGS,
        summary="Solicitar redefinição de senha",
        description=(
            "Gera um token de recuperação e o envia por e-mail. A resposta é sempre a mesma, exista "
            "ou não uma conta com aquele e-mail, para não revelar quem está cadastrado."
        ),
        request=PasswordResetRequestInputSerializer,
        responses={200: MessageResponseSerializer, **error_responses(400, 502)},
    )
    def post(self, request: Request) -> Response:
        PasswordResetService.request_reset(request.data)
        return Response(
            MessageResponseSerializer({"message": RESET_REQUESTED_MESSAGE}).data,
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(PublicAuthView):
    @extend_schema(
        tags=TAGS,
        summary="Confirmar redefinição de senha",
        description=(
            "Troca a senha usando o token recebido por e-mail. O token é de uso único e expira; "
            "pedidos anteriores em aberto são invalidados a cada nova solicitação."
        ),
        request=PasswordResetConfirmInputSerializer,
        responses={
            200: MessageResponseSerializer,
            400: error_response(400, "Token inválido, expirado ou já utilizado."),
        },
    )
    def post(self, request: Request) -> Response:
        PasswordResetService.confirm_reset(request.data)
        return Response(
            MessageResponseSerializer({"message": PASSWORD_UPDATED_MESSAGE}).data,
            status=status.HTTP_200_OK,
        )
