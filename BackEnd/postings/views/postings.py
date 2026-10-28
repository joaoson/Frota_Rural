from uuid import UUID

from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticatedOrReadOnly

from common.request import authenticated_user, optional_user
from common.schemas import error_response, error_responses
from postings.serializer import (
    PostingDetailOutputSerializer,
    PostingFilterSerializer,
    PostingInputSerializer,
    PostingListOutputSerializer,
    PostingOutputSerializer,
)
from postings.services import PostingService

TAGS = ["Anúncios"]
POSTING_NOT_FOUND = error_response(404, "Anúncio não encontrado.")


class PostingListView(APIView):
    permission_classes = [IsAuthenticatedOrReadOnly]

    @extend_schema(
        tags=TAGS,
        summary="Listar anúncios",
        description=(
            "Retorna os anúncios de locação com a foto principal e os dados da máquina já embutidos.\n\n"
            "Os filtros de data consideram a sobreposição entre o período informado e a "
            "disponibilidade do anúncio; anúncios sem data definida aparecem em qualquer busca."
        ),
        parameters=[PostingFilterSerializer],
        responses={200: PostingListOutputSerializer(many=True), **error_responses(400)},
    )
    def get(self, request: Request) -> Response:
        postings = PostingService.list(request.query_params, actor=optional_user(request))
        return Response(
            PostingListOutputSerializer(postings, many=True).data, status=status.HTTP_200_OK
        )

    @extend_schema(
        tags=TAGS,
        summary="Criar anúncio",
        description="Publica uma máquina já cadastrada para locação, com valor por hora, localização e janela de disponibilidade.",
        request=PostingInputSerializer,
        responses={201: PostingOutputSerializer, **error_responses(400, 409)},
        examples=[
            OpenApiExample(
                "Novo Anúncio de Máquina",
                summary="Colocar uma máquina disponível para locação",
                value={
                    "machinery": "123e4567-e89b-12d3-a456-426614174000",
                    "hourly_rate": "180.50",
                    "location_cep": "84165-000",
                    "location_address": "Fazenda São Jorge, Castro - PR",
                    "availability_start": "2026-09-01T00:00:00Z",
                    "availability_end": "2026-12-31T23:59:59Z",
                    "status": "active",
                },
                request_only=True,
            )
        ],
    )
    def post(self, request: Request) -> Response:
        posting = PostingService.create(request.data, actor=authenticated_user(request))
        return Response(PostingOutputSerializer(posting).data, status=status.HTTP_201_CREATED)


class PostingDetailView(APIView):
    permission_classes = [IsAuthenticatedOrReadOnly]

    @extend_schema(
        tags=TAGS,
        summary="Consultar anúncio",
        description="Retorna o anúncio com os dados completos da máquina, incluindo as especificações técnicas.",
        responses={200: PostingDetailOutputSerializer, 404: POSTING_NOT_FOUND},
    )
    def get(self, request: Request, pk: UUID) -> Response:
        posting = PostingService.get(pk, actor=optional_user(request))
        return Response(PostingDetailOutputSerializer(posting).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Substituir anúncio",
        description="Substitui os campos editáveis de anúncio pertencente ao locador autenticado. Contratos existentes preservam seus valores acordados.",
        request=PostingInputSerializer,
        responses={
            200: PostingOutputSerializer,
            **error_responses(400, 409),
            404: POSTING_NOT_FOUND,
        },
    )
    def put(self, request: Request, pk: UUID) -> Response:
        posting = PostingService.update(pk, request.data, actor=authenticated_user(request))
        return Response(PostingOutputSerializer(posting).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Atualizar anúncio parcialmente",
        description="Usado para ajustar preço, disponibilidade ou status (ex.: pausar o anúncio) sem reenviar todos os campos.",
        request=PostingInputSerializer,
        responses={
            200: PostingOutputSerializer,
            **error_responses(400, 409),
            404: POSTING_NOT_FOUND,
        },
    )
    def patch(self, request: Request, pk: UUID) -> Response:
        posting = PostingService.update(pk, request.data, actor=authenticated_user(request), partial=True)
        return Response(PostingOutputSerializer(posting).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Excluir anúncio",
        description="Remove anúncio autorizado quando seus vínculos permitem a exclusão.",
        responses={
            204: None,
            404: POSTING_NOT_FOUND,
            409: error_response(409, "Existem registros dependentes (ex.: locações)."),
        },
    )
    def delete(self, request: Request, pk: UUID) -> Response:
        PostingService.delete(pk, actor=authenticated_user(request))
        return Response(status=status.HTTP_204_NO_CONTENT)
