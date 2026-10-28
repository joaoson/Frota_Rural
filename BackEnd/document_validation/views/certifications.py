from uuid import UUID

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from administration.permissions import IsPlatformAdmin

from common.request import authenticated_user
from common.schemas import error_response, error_responses
from document_validation.serializer import (
    AreaCertificacaoOutputSerializer,
    CertificationInputSerializer,
    CertificationOutputSerializer,
    DocumentFilterSerializer,
    DocumentReviewInputSerializer,
)
from document_validation.services import AreaCertificacaoService, CertificationService

TAGS = ["Documentos"]
CERTIFICATION_NOT_FOUND = error_response(404, "Certificação não encontrada.")


class CertificationListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Listar certificações",
        description="Retorna as certificações declaradas pelos usuários (ex.: NR-31), com filtros opcionais.",
        parameters=[DocumentFilterSerializer],
        responses={200: CertificationOutputSerializer(many=True), **error_responses(400)},
    )
    def get(self, request: Request) -> Response:
        certifications = CertificationService.list(request.query_params, actor=authenticated_user(request))
        return Response(
            CertificationOutputSerializer(certifications, many=True).data,
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        tags=TAGS,
        summary="Cadastrar certificação",
        description="Cadastra uma certificação. Ela sempre entra com `validation_status` igual a `pending`.",
        request=CertificationInputSerializer,
        responses={201: CertificationOutputSerializer, **error_responses(400, 409)},
    )
    def post(self, request: Request) -> Response:
        certification = CertificationService.create(request.data, actor=authenticated_user(request))
        return Response(
            CertificationOutputSerializer(certification).data, status=status.HTTP_201_CREATED
        )


class CertificationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Consultar certificação",
        description="Consulta os dados da certificação conforme a permissão do usuário.",
        responses={200: CertificationOutputSerializer, 404: CERTIFICATION_NOT_FOUND},
    )
    def get(self, request: Request, pk: UUID) -> Response:
        certification = CertificationService.get(pk, actor=authenticated_user(request))
        return Response(
            CertificationOutputSerializer(certification).data, status=status.HTTP_200_OK
        )

    @extend_schema(
        tags=TAGS,
        summary="Substituir certificação",
        description="Atualiza todos os campos. A validação volta para `pending` e a nota de análise é limpa.",
        request=CertificationInputSerializer,
        responses={
            200: CertificationOutputSerializer,
            **error_responses(400, 409),
            404: CERTIFICATION_NOT_FOUND,
        },
    )
    def put(self, request: Request, pk: UUID) -> Response:
        certification = CertificationService.update(pk, request.data, actor=authenticated_user(request))
        return Response(
            CertificationOutputSerializer(certification).data, status=status.HTTP_200_OK
        )

    @extend_schema(
        tags=TAGS,
        summary="Atualizar certificação parcialmente",
        description="Atualiza apenas os campos enviados. A validação volta para `pending`.",
        request=CertificationInputSerializer,
        responses={
            200: CertificationOutputSerializer,
            **error_responses(400, 409),
            404: CERTIFICATION_NOT_FOUND,
        },
    )
    def patch(self, request: Request, pk: UUID) -> Response:
        certification = CertificationService.update(pk, request.data, actor=authenticated_user(request), partial=True)
        return Response(
            CertificationOutputSerializer(certification).data, status=status.HTTP_200_OK
        )

    @extend_schema(
        tags=TAGS,
        summary="Excluir certificação",
        description="Exclui uma certificação após verificar o acesso do usuário.",
        responses={204: None, 404: CERTIFICATION_NOT_FOUND},
    )
    def delete(self, request: Request, pk: UUID) -> Response:
        CertificationService.delete(pk, actor=authenticated_user(request))
        return Response(status=status.HTTP_204_NO_CONTENT)


class CertificationReviewView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(
        tags=TAGS,
        summary="Analisar certificação",
        description="Registra a análise manual de uma certificação. Ao rejeitar, `review_note` é obrigatório.",
        request=DocumentReviewInputSerializer,
        responses={
            200: CertificationOutputSerializer,
            400: error_response(400, "Decisão inválida ou rejeição sem justificativa."),
            404: CERTIFICATION_NOT_FOUND,
        },
    )
    def patch(self, request: Request, pk: UUID) -> Response:
        certification = CertificationService.review(pk, request.data, actor=authenticated_user(request))
        return Response(
            CertificationOutputSerializer(certification).data, status=status.HTTP_200_OK
        )


class AreaCertificacaoListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Listar áreas de certificação",
        description="Opções da tabela `areas_certificacao` usadas no envio de certificações.",
        responses={200: AreaCertificacaoOutputSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        areas = AreaCertificacaoService.list()
        return Response(AreaCertificacaoOutputSerializer(areas, many=True).data, status=status.HTTP_200_OK)
