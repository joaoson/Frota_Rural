from uuid import UUID

from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from administration.permissions import IsPlatformAdmin

from administration.services import UserModerationService
from common.schemas import MessageResponseSerializer, error_response

TAGS = ["Administração"]
USER_NOT_FOUND = error_response(404, "Usuário não encontrado.")


def _message(text: str) -> Response:
    return Response(MessageResponseSerializer({"message": text}).data, status=status.HTTP_200_OK)


class UserWarnView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(
        tags=TAGS,
        summary="Advertir usuário",
        description=(
            "Marca o usuário com o status `warned`. Serve como aviso formal antes de medidas "
            "mais severas e não altera anúncios ou locações em andamento."
        ),
        request=None,
        responses={
            200: MessageResponseSerializer,
            400: error_response(400, "Usuário já está suspenso ou banido."),
            404: USER_NOT_FOUND,
        },
        examples=[
            OpenApiExample(
                "Advertência aplicada",
                value={"message": "Advertência aplicada ao usuário João Silva."},
                response_only=True,
            )
        ],
    )
    def put(self, request: Request, pk: UUID) -> Response:
        user = UserModerationService.warn(pk)
        return _message(f"Advertência aplicada ao usuário {user.name}.")


class UserSuspendView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(
        tags=TAGS,
        summary="Suspender usuário",
        description=(
            "Suspende a conta e propaga o efeito na operação, na mesma transação: os anúncios "
            "ativos do usuário passam a `suspended` e as locações em que ele é locatário com "
            "status `pending` são canceladas."
        ),
        request=None,
        responses={
            200: MessageResponseSerializer,
            400: error_response(400, "Usuário já está banido."),
            404: USER_NOT_FOUND,
        },
    )
    def put(self, request: Request, pk: UUID) -> Response:
        user = UserModerationService.suspend(pk)
        return _message(f"Usuário {user.name} suspenso.")


class UserBanView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(
        tags=TAGS,
        summary="Banir usuário",
        description=(
            "Bane a conta permanentemente, na mesma transação: todos os anúncios do usuário são "
            "inativados, as locações `pending` e `active` são canceladas e os contratos ainda "
            "pendentes de assinatura também passam a `cancelled`."
        ),
        request=None,
        responses={200: MessageResponseSerializer, 404: USER_NOT_FOUND},
    )
    def put(self, request: Request, pk: UUID) -> Response:
        user = UserModerationService.ban(pk)
        return _message(f"Usuário {user.name} banido permanentemente.")
