from django.db import IntegrityError
from drf_spectacular.utils import (
    OpenApiExample,
    OpenApiParameter,
    OpenApiResponse,
    extend_schema,
    extend_schema_view,
)
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from common.schemas import ErrorResponseSerializer
from reviews.models import Reviews
from reviews.serializer import ReviewSerializer

REVIEW_NOT_FOUND = OpenApiResponse(description="Avaliação não encontrada.")
INVALID_DATA = OpenApiResponse(description="Dados inválidos ou em conflito.")


def _reviews_queryset():
    return Reviews.objects.all().select_related("reviewer", "reviewee")


@extend_schema_view(
    get=extend_schema(
        tags=["Avaliações"],
        summary="Listar avaliações",
        description="Retorna as avaliações registradas, com filtros opcionais por avaliador, avaliado ou locação.",
        parameters=[
            OpenApiParameter("reviewee", type=str, description="ID do usuário avaliado"),
            OpenApiParameter("reviewer", type=str, description="ID do usuário que avaliou"),
            OpenApiParameter("rental", type=str, description="ID da locação"),
        ],
        responses={200: ReviewSerializer(many=True)},
    ),
    post=extend_schema(
        tags=["Avaliações"],
        summary="Criar avaliação",
        description="Registra a avaliação de uma das partes ao final de uma locação. Cada locação aceita uma avaliação por avaliador.",
        request=ReviewSerializer,
        responses={
            201: ReviewSerializer,
            400: OpenApiResponse(
                response=ErrorResponseSerializer,
                description="Dados inválidos ou avaliação já existente para esta locação.",
            ),
        },
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
    ),
)
@api_view(["GET", "POST"])
def reviews_list(request):
    if request.method == "GET":
        qs = _reviews_queryset().order_by("-created_at", "-id")
        reviewee_id = request.query_params.get("reviewee")
        if reviewee_id:
            qs = qs.filter(reviewee_id=reviewee_id)
        reviewer_id = request.query_params.get("reviewer")
        if reviewer_id:
            qs = qs.filter(reviewer_id=reviewer_id)
        rental_id = request.query_params.get("rental")
        if rental_id:
            qs = qs.filter(rental_id=rental_id)

        serializer = ReviewSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    serializer = ReviewSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    try:
        serializer.save()
    except IntegrityError:
        return Response(
            {
                "error": "Dados inválidos ou em conflito (ex.: avaliação já existe para este aluguel)."
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    get=extend_schema(
        tags=["Avaliações"],
        summary="Consultar avaliação",
        responses={200: ReviewSerializer, 404: REVIEW_NOT_FOUND},
    ),
    put=extend_schema(
        tags=["Avaliações"],
        summary="Substituir avaliação",
        request=ReviewSerializer,
        responses={200: ReviewSerializer, 400: INVALID_DATA, 404: REVIEW_NOT_FOUND},
    ),
    patch=extend_schema(
        tags=["Avaliações"],
        summary="Atualizar avaliação parcialmente",
        description="Útil para corrigir apenas a nota ou o comentário.",
        request=ReviewSerializer,
        responses={200: ReviewSerializer, 400: INVALID_DATA, 404: REVIEW_NOT_FOUND},
    ),
    delete=extend_schema(
        tags=["Avaliações"],
        summary="Excluir avaliação",
        responses={
            204: OpenApiResponse(description="Avaliação excluída."),
            404: REVIEW_NOT_FOUND,
            409: OpenApiResponse(
                response=ErrorResponseSerializer,
                description="A avaliação não pode ser excluída por estar referenciada em outro registro.",
            ),
        },
    ),
)
@api_view(["GET", "PUT", "PATCH", "DELETE"])
def review_detail(request, pk):
    try:
        review = _reviews_queryset().get(pk=pk)
    except Reviews.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(ReviewSerializer(review).data, status=status.HTTP_200_OK)

    if request.method in ("PUT", "PATCH"):
        serializer = ReviewSerializer(review, data=request.data, partial=request.method == "PATCH")
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            serializer.save()
        except IntegrityError:
            return Response(
                {"error": "Dados inválidos ou em conflito."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(serializer.data, status=status.HTTP_200_OK)

    try:
        review.delete()
    except IntegrityError:
        return Response(
            {"error": "Não é possível excluir esta avaliação."},
            status=status.HTTP_409_CONFLICT,
        )
    return Response(status=status.HTTP_204_NO_CONTENT)
