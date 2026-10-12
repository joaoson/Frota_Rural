from uuid import UUID

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from common.schemas import error_response, error_responses
from document_validation.serializer import (
    CertificationInputSerializer,
    CertificationOutputSerializer,
    DocumentFilterSerializer,
    DocumentReviewInputSerializer,
)
from document_validation.services import CertificationService

TAGS = ["Documentos"]
CERTIFICATION_NOT_FOUND = error_response(404, "Certificação não encontrada.")


class CertificationListView(APIView):
    @extend_schema(
        tags=TAGS,
        summary="Listar certificações",
        description="Retorna as certificações declaradas pelos usuários (ex.: NR-31), com filtros opcionais.",
        parameters=[DocumentFilterSerializer],
        responses={200: CertificationOutputSerializer(many=True), **error_responses(400)},
    )
    def get(self, request: Request) -> Response:
        certifications = CertificationService.list(request.query_params)
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
        certification = CertificationService.create(request.data)
        return Response(
            CertificationOutputSerializer(certification).data, status=status.HTTP_201_CREATED
        )


class CertificationDetailView(APIView):
    @extend_schema(
        tags=TAGS,
        summary="Consultar certificação",
        responses={200: CertificationOutputSerializer, 404: CERTIFICATION_NOT_FOUND},
    )
    def get(self, request: Request, pk: UUID) -> Response:
        certification = CertificationService.get(pk)
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
        certification = CertificationService.update(pk, request.data)
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
        certification = CertificationService.update(pk, request.data, partial=True)
        return Response(
            CertificationOutputSerializer(certification).data, status=status.HTTP_200_OK
        )

    @extend_schema(
        tags=TAGS,
        summary="Excluir certificação",
        responses={204: None, 404: CERTIFICATION_NOT_FOUND},
    )
    def delete(self, request: Request, pk: UUID) -> Response:
        CertificationService.delete(pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CertificationReviewView(APIView):
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
        certification = CertificationService.review(pk, request.data)
        return Response(
            CertificationOutputSerializer(certification).data, status=status.HTTP_200_OK
        )
