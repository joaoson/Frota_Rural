from uuid import UUID

from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from common.schemas import error_response, error_responses
from reviews.serializer import (
    ReviewFilterSerializer,
    ReviewInputSerializer,
    ReviewOutputSerializer,
)
from reviews.services import ReviewService

TAGS = ["Avaliações"]
REVIEW_NOT_FOUND = error_response(404, "Avaliação não encontrada.")
INVALID_REVIEW = error_response(400, "Dados inválidos ou avaliação já existente para esta locação.")


class ReviewListView(APIView):
    @extend_schema(
        tags=TAGS,
        summary="Listar avaliações",
        description="Retorna as avaliações registradas, com filtros opcionais por avaliador, avaliado ou locação.",
        parameters=[ReviewFilterSerializer],
        responses={200: ReviewOutputSerializer(many=True), **error_responses(400)},
    )
    def get(self, request: Request) -> Response:
        reviews = ReviewService.list(request.query_params)
        return Response(ReviewOutputSerializer(reviews, many=True).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Criar avaliação",
        description="Registra a avaliação (1 a 5) de uma das partes ao final de uma locação. Cada locação aceita uma avaliação por avaliador.",
        request=ReviewInputSerializer,
        responses={201: ReviewOutputSerializer, 400: INVALID_REVIEW, **error_responses(409)},
        examples=[
            OpenApiExample(
                "Avaliação 5 estrelas",
                summary="Exemplo de uma avaliação excelente",
                value={
                    "rental": "08e8eaa6-467f-4c98-b5c0-93323829911d",
                    "reviewer": "e6a2b8e5-3d71-4a9f-b98a-f4c78d0671f2",
                    "reviewee": "029d15f3-a577-4238-9c59-42011ddcb5be",
                    "rating": 5,
                    "comment": "Trator em perfeito estado e entrega pontual!",
                },
                request_only=True,
            )
        ],
    )
    def post(self, request: Request) -> Response:
        review = ReviewService.create(request.data)
        return Response(ReviewOutputSerializer(review).data, status=status.HTTP_201_CREATED)


class ReviewDetailView(APIView):
    @extend_schema(
        tags=TAGS,
        summary="Consultar avaliação",
        responses={200: ReviewOutputSerializer, 404: REVIEW_NOT_FOUND},
    )
    def get(self, request: Request, pk: UUID) -> Response:
        review = ReviewService.get(pk)
        return Response(ReviewOutputSerializer(review).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Substituir avaliação",
        request=ReviewInputSerializer,
        responses={
            200: ReviewOutputSerializer,
            400: INVALID_REVIEW,
            404: REVIEW_NOT_FOUND,
            **error_responses(409),
        },
    )
    def put(self, request: Request, pk: UUID) -> Response:
        review = ReviewService.update(pk, request.data)
        return Response(ReviewOutputSerializer(review).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Atualizar avaliação parcialmente",
        description="Útil para corrigir apenas a nota ou o comentário.",
        request=ReviewInputSerializer,
        responses={
            200: ReviewOutputSerializer,
            400: INVALID_REVIEW,
            404: REVIEW_NOT_FOUND,
            **error_responses(409),
        },
    )
    def patch(self, request: Request, pk: UUID) -> Response:
        review = ReviewService.update(pk, request.data, partial=True)
        return Response(ReviewOutputSerializer(review).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Excluir avaliação",
        responses={
            204: None,
            404: REVIEW_NOT_FOUND,
            409: error_response(409, "A avaliação está referenciada em outro registro."),
        },
    )
    def delete(self, request: Request, pk: UUID) -> Response:
        ReviewService.delete(pk)
        return Response(status=status.HTTP_204_NO_CONTENT)
