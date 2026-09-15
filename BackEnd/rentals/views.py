from uuid import UUID

from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from common.schemas import error_response, error_responses
from rentals.serializer import (
    RentalFilterSerializer,
    RentalInputSerializer,
    RentalOutputSerializer,
)
from rentals.services import RentalService

TAGS = ["Locações"]
RENTAL_NOT_FOUND = error_response(404, "Locação não encontrada.")
INVALID_RENTAL = error_response(
    400, "Dados inválidos, período acima do limite do anúncio ou em conflito com outra reserva."
)


class RentalListView(APIView):
    @extend_schema(
        tags=TAGS,
        summary="Listar locações",
        description="Retorna as locações (reservas), com filtros opcionais por anúncio, locatário ou locador dono do maquinário.",
        parameters=[RentalFilterSerializer],
        responses={200: RentalOutputSerializer(many=True), **error_responses(400)},
    )
    def get(self, request: Request) -> Response:
        rentals = RentalService.list(request.query_params)
        return Response(RentalOutputSerializer(rentals, many=True).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Criar locação (reserva)",
        description=(
            "Cria a reserva de um anúncio e, na mesma transação, o contrato correspondente com "
            "status `pending_signatures`. Não é necessário criar o contrato em uma chamada separada."
        ),
        request=RentalInputSerializer,
        responses={201: RentalOutputSerializer, 400: INVALID_RENTAL},
        examples=[
            OpenApiExample(
                "Nova Reserva de Trator",
                summary="Exemplo de criação de uma locação",
                value={
                    "postings": "f5e1c4a0-56d1-4b7c-9a1b-c1d4e6f8a9b2",
                    "lessee": "e6a2b8e5-3d71-4a9f-b98a-f4c78d0671f2",
                    "start_date": "2026-09-10T08:00:00Z",
                    "end_date": "2026-09-15T18:00:00Z",
                    "total_price": "8500.00",
                },
                request_only=True,
            )
        ],
    )
    def post(self, request: Request) -> Response:
        rental = RentalService.create(request.data)
        return Response(RentalOutputSerializer(rental).data, status=status.HTTP_201_CREATED)


class RentalDetailView(APIView):
    @extend_schema(
        tags=TAGS,
        summary="Consultar locação",
        responses={200: RentalOutputSerializer, 404: RENTAL_NOT_FOUND},
    )
    def get(self, request: Request, pk: UUID) -> Response:
        rental = RentalService.get(pk)
        return Response(RentalOutputSerializer(rental).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Substituir locação",
        request=RentalInputSerializer,
        responses={200: RentalOutputSerializer, 400: INVALID_RENTAL, 404: RENTAL_NOT_FOUND},
    )
    def put(self, request: Request, pk: UUID) -> Response:
        rental = RentalService.update(pk, request.data)
        return Response(RentalOutputSerializer(rental).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Atualizar locação parcialmente",
        description="Usado principalmente para avançar o status da locação (ex.: `active`, `completed`, `cancelled`).",
        request=RentalInputSerializer,
        responses={200: RentalOutputSerializer, 400: INVALID_RENTAL, 404: RENTAL_NOT_FOUND},
    )
    def patch(self, request: Request, pk: UUID) -> Response:
        rental = RentalService.update(pk, request.data, partial=True)
        return Response(RentalOutputSerializer(rental).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Excluir locação",
        responses={
            204: None,
            404: RENTAL_NOT_FOUND,
            409: error_response(409, "Existem registros dependentes (ex.: contrato)."),
        },
    )
    def delete(self, request: Request, pk: UUID) -> Response:
        RentalService.delete(pk)
        return Response(status=status.HTTP_204_NO_CONTENT)
