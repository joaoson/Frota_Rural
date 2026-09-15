from collections.abc import Sequence
from uuid import UUID

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from common.request import authenticated_user
from common.schemas import error_response, error_responses
from users.serializer import (
    OperatorCreateInputSerializer,
    OperatorOutputSerializer,
    OperatorUpdateInputSerializer,
)
from users.services import OperatorService

TAGS = ["Operadores"]
OPERATOR_NOT_FOUND = error_response(404, "Operador não encontrado na sua equipe.")


class OperatorListView(APIView):
    permission_classes: Sequence[type[BasePermission]] = (IsAuthenticated,)

    @extend_schema(
        tags=TAGS,
        summary="Listar os operadores da minha equipe",
        description="Retorna os operadores cadastrados pelo usuário autenticado, em ordem alfabética.",
        responses={200: OperatorOutputSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        operators = OperatorService.list(authenticated_user(request))
        return Response(
            OperatorOutputSerializer(operators, many=True).data, status=status.HTTP_200_OK
        )

    @extend_schema(
        tags=TAGS,
        summary="Cadastrar um operador na minha equipe",
        description=(
            "Cria uma conta com papel `operador` já vinculada ao usuário autenticado. "
            "A senha inicial é definida por quem cadastra e repassada ao operador."
        ),
        request=OperatorCreateInputSerializer,
        responses={
            201: OperatorOutputSerializer,
            **error_responses(400, 409),
            403: error_response(403, "Cadastro bloqueado (documento de conta banida)."),
        },
    )
    def post(self, request: Request) -> Response:
        operator = OperatorService.create(authenticated_user(request), request.data)
        return Response(OperatorOutputSerializer(operator).data, status=status.HTTP_201_CREATED)


class OperatorDetailView(APIView):
    permission_classes: Sequence[type[BasePermission]] = (IsAuthenticated,)

    @extend_schema(
        tags=TAGS,
        summary="Consultar um operador da minha equipe",
        responses={200: OperatorOutputSerializer, 404: OPERATOR_NOT_FOUND},
    )
    def get(self, request: Request, pk: UUID) -> Response:
        operator = OperatorService.get(authenticated_user(request), pk)
        return Response(OperatorOutputSerializer(operator).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Atualizar um operador da minha equipe",
        description="Atualiza apenas os campos enviados. Papel e vínculo não são editáveis.",
        request=OperatorUpdateInputSerializer,
        responses={
            200: OperatorOutputSerializer,
            **error_responses(400, 409),
            404: OPERATOR_NOT_FOUND,
        },
    )
    def patch(self, request: Request, pk: UUID) -> Response:
        operator = OperatorService.update(authenticated_user(request), pk, request.data)
        return Response(OperatorOutputSerializer(operator).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Desvincular um operador da minha equipe",
        description=(
            "Remove o vínculo sem apagar a conta: o histórico de locações em que o "
            "operador aparece continua íntegro, e ele deixa de constar na equipe."
        ),
        responses={204: None, 404: OPERATOR_NOT_FOUND},
    )
    def delete(self, request: Request, pk: UUID) -> Response:
        OperatorService.unlink(authenticated_user(request), pk)
        return Response(status=status.HTTP_204_NO_CONTENT)
