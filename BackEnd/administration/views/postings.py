from uuid import UUID

from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from administration.permissions import IsPlatformAdmin

from administration.serializer import PostingRejectionInputSerializer
from administration.services import PostingModerationService
from common.request import optional_user
from common.schemas import MessageResponseSerializer, error_response

TAGS = ["Administração"]
POSTING_NOT_FOUND = error_response(404, "Anúncio não encontrado.")


class PostingApproveView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(
        tags=TAGS,
        summary="Aprovar anúncio",
        description=(
            "Aprova o anúncio na moderação (RF17), deixando-o com status `active`, e registra a "
            "decisão no histórico de moderação junto com o administrador responsável."
        ),
        request=None,
        responses={200: MessageResponseSerializer, 404: POSTING_NOT_FOUND},
    )
    def put(self, request: Request, pk: UUID) -> Response:
        PostingModerationService.approve(pk, moderator=optional_user(request))
        return Response(
            MessageResponseSerializer({"message": "Anúncio aprovado e mantido ativo."}).data,
            status=status.HTTP_200_OK,
        )


class PostingRejectView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(
        tags=TAGS,
        summary="Reprovar anúncio",
        description=(
            "Reprova o anúncio na moderação (RF17). O motivo é obrigatório, fica gravado no "
            "histórico de moderação e o anúncio passa a ter status `rejected`."
        ),
        request=PostingRejectionInputSerializer,
        responses={
            200: MessageResponseSerializer,
            400: error_response(400, "Motivo da reprovação não informado."),
            404: POSTING_NOT_FOUND,
        },
        examples=[
            OpenApiExample(
                "Reprovação por foto inválida",
                value={"reason": "As fotos enviadas não mostram o maquinário anunciado."},
                request_only=True,
            )
        ],
    )
    def put(self, request: Request, pk: UUID) -> Response:
        PostingModerationService.reject(pk, request.data, moderator=optional_user(request))
        return Response(
            MessageResponseSerializer({"message": "Anúncio reprovado."}).data,
            status=status.HTTP_200_OK,
        )
