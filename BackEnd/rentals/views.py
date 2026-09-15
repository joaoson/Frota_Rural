import uuid

from django.utils import timezone
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

from contracts.models import Contracts
from rentals.models import Rentals
from rentals.serializer import RentalSerializer

RENTAL_NOT_FOUND = OpenApiResponse(description="Locação não encontrada.")
INVALID_DATA = OpenApiResponse(description="Dados inválidos ou em conflito.")


@extend_schema_view(
    get=extend_schema(
        tags=["Locações"],
        summary="Listar locações",
        description="Retorna as locações (reservas), com filtros opcionais por locatário ou por locador dono do maquinário.",
        parameters=[
            OpenApiParameter("lessee", type=str, description="Filtrar pelo ID do locatário"),
            OpenApiParameter("lessor", type=str, description="Filtrar pelo ID do locador"),
        ],
        responses={200: RentalSerializer(many=True)},
    ),
    post=extend_schema(
        tags=["Locações"],
        summary="Criar locação (reserva)",
        description=(
            "Cria a reserva de um anúncio e, junto com ela, o contrato correspondente com status "
            "`pending_signatures`. Não é necessário criar o contrato em uma chamada separada."
        ),
        request=RentalSerializer,
        responses={201: RentalSerializer, 400: INVALID_DATA},
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
    ),
)
@api_view(["GET", "POST"])
def rentals_list(request):
    if request.method == "GET":
        qs = Rentals.objects.all().select_related(
            "lessee", "postings__machinery__owner", "contracts"
        )
        posting_id = request.query_params.get("postings")
        if posting_id:
            qs = qs.filter(postings_id=posting_id)
        lessee_id = request.query_params.get("lessee")
        if lessee_id:
            qs = qs.filter(lessee_id=lessee_id)
        lessor_id = request.query_params.get("lessor")
        if lessor_id:
            qs = qs.filter(postings__machinery__owner_id=lessor_id)
        serializer = RentalSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    serializer = RentalSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    rental = serializer.save()

    # Automatically create matching Contract
    Contracts.objects.create(
        id=uuid.uuid4(),
        rental=rental,
        accepted_by_lessor=False,
        accepted_by_lessee=False,
        status="pending_signatures",
        created_at=timezone.now(),
    )

    return Response(RentalSerializer(rental).data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    get=extend_schema(
        tags=["Locações"],
        summary="Consultar locação",
        responses={200: RentalSerializer, 404: RENTAL_NOT_FOUND},
    ),
    put=extend_schema(
        tags=["Locações"],
        summary="Substituir locação",
        request=RentalSerializer,
        responses={200: RentalSerializer, 400: INVALID_DATA, 404: RENTAL_NOT_FOUND},
    ),
    patch=extend_schema(
        tags=["Locações"],
        summary="Atualizar locação parcialmente",
        description="Usado principalmente para avançar o status da locação (ex.: `active`, `completed`, `cancelled`).",
        request=RentalSerializer,
        responses={200: RentalSerializer, 400: INVALID_DATA, 404: RENTAL_NOT_FOUND},
    ),
    delete=extend_schema(
        tags=["Locações"],
        summary="Excluir locação",
        responses={204: OpenApiResponse(description="Locação excluída."), 404: RENTAL_NOT_FOUND},
    ),
)
@api_view(["GET", "PUT", "PATCH", "DELETE"])
def rental_detail(request, pk):
    try:
        rental = Rentals.objects.select_related("contracts").get(pk=pk)
    except Rentals.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(RentalSerializer(rental).data, status=status.HTTP_200_OK)

    if request.method == "PUT":
        serializer = RentalSerializer(rental, data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    if request.method == "PATCH":
        serializer = RentalSerializer(rental, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    rental.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
