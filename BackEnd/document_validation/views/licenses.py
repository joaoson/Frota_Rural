from uuid import UUID

from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from administration.permissions import IsPlatformAdmin

from common.request import authenticated_user
from common.schemas import error_response, error_responses
from document_validation.serializer import (
    DocumentFilterSerializer,
    DocumentReviewInputSerializer,
    OperatorLicenseInputSerializer,
    OperatorLicenseOutputSerializer,
)
from document_validation.services import OperatorLicenseService

TAGS = ["Documentos"]
LICENSE_NOT_FOUND = error_response(404, "CNH não encontrada.")


class OperatorLicenseListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Listar CNHs cadastradas",
        description="Retorna as CNHs de operadores, opcionalmente filtradas por usuário e por status de validação.",
        parameters=[DocumentFilterSerializer],
        responses={200: OperatorLicenseOutputSerializer(many=True), **error_responses(400)},
    )
    def get(self, request: Request) -> Response:
        licenses = OperatorLicenseService.list(request.query_params, actor=authenticated_user(request))
        return Response(
            OperatorLicenseOutputSerializer(licenses, many=True).data, status=status.HTTP_200_OK
        )

    @extend_schema(
        tags=TAGS,
        summary="Cadastrar CNH",
        description=(
            "Cadastra a CNH de um operador. O documento sempre entra com `validation_status` "
            "igual a `pending` até a análise de um administrador."
        ),
        request=OperatorLicenseInputSerializer,
        responses={201: OperatorLicenseOutputSerializer, **error_responses(400, 409)},
    )
    def post(self, request: Request) -> Response:
        license_ = OperatorLicenseService.create(request.data, actor=authenticated_user(request))
        return Response(
            OperatorLicenseOutputSerializer(license_).data, status=status.HTTP_201_CREATED
        )


class OperatorLicenseDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Consultar CNH",
        description="Consulta um documento de habilitação de acordo com as permissões do titular ou administrador.",
        responses={200: OperatorLicenseOutputSerializer, 404: LICENSE_NOT_FOUND},
    )
    def get(self, request: Request, pk: UUID) -> Response:
        license_ = OperatorLicenseService.get(pk, actor=authenticated_user(request))
        return Response(OperatorLicenseOutputSerializer(license_).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Substituir CNH",
        description="Atualiza todos os campos da CNH. A validação volta para `pending` e a nota de análise é limpa.",
        request=OperatorLicenseInputSerializer,
        responses={
            200: OperatorLicenseOutputSerializer,
            **error_responses(400, 409),
            404: LICENSE_NOT_FOUND,
        },
    )
    def put(self, request: Request, pk: UUID) -> Response:
        license_ = OperatorLicenseService.update(pk, request.data, actor=authenticated_user(request))
        return Response(OperatorLicenseOutputSerializer(license_).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Atualizar CNH parcialmente",
        description="Atualiza apenas os campos enviados. A validação volta para `pending`.",
        request=OperatorLicenseInputSerializer,
        responses={
            200: OperatorLicenseOutputSerializer,
            **error_responses(400, 409),
            404: LICENSE_NOT_FOUND,
        },
    )
    def patch(self, request: Request, pk: UUID) -> Response:
        license_ = OperatorLicenseService.update(pk, request.data, actor=authenticated_user(request), partial=True)
        return Response(OperatorLicenseOutputSerializer(license_).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Excluir CNH",
        description="Exclui o documento de habilitação autorizado e seus dados de análise.",
        responses={204: None, 404: LICENSE_NOT_FOUND},
    )
    def delete(self, request: Request, pk: UUID) -> Response:
        OperatorLicenseService.delete(pk, actor=authenticated_user(request))
        return Response(status=status.HTTP_204_NO_CONTENT)


class OperatorLicenseReviewView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(
        tags=TAGS,
        summary="Analisar CNH",
        description=(
            "Registra a análise manual de uma CNH. Ao rejeitar, `review_note` é obrigatório e a "
            "justificativa fica visível para o dono do documento."
        ),
        request=DocumentReviewInputSerializer,
        responses={
            200: OperatorLicenseOutputSerializer,
            400: error_response(400, "Decisão inválida ou rejeição sem justificativa."),
            404: LICENSE_NOT_FOUND,
        },
        examples=[
            OpenApiExample(
                "Rejeição com justificativa",
                value={
                    "validation_status": "rejected",
                    "review_note": "Imagem ilegível, reenvie a CNH aberta.",
                },
                request_only=True,
            )
        ],
    )
    def patch(self, request: Request, pk: UUID) -> Response:
        license_ = OperatorLicenseService.review(pk, request.data, actor=authenticated_user(request))
        return Response(OperatorLicenseOutputSerializer(license_).data, status=status.HTTP_200_OK)
