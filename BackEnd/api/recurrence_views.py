from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.recurrence import (
    RecurrenceCreateRequestSerializer, RecurrencePreviewRequestSerializer,
    build_preview, create_recurrence, preview_response, series_response, source_for_user,
)
from common.schemas import error_responses

from rentals.serializer import RentalOutputSerializer

RECURRENCE_EXAMPLE = {
    "first_start_date": "2030-06-10", "frequency": "monthly", "occurrences": 3,
}
RECURRENCE_EXAMPLE_DESCRIPTION = (
    "Use uma locação de origem do usuário autenticado e ajuste a primeira data à política "
    "e agenda. A quantidade conta novas reservas, além da origem. A frequência aceita "
    "weekly, biweekly ou monthly; a duração vem da locação de origem."
)

class RecurrenceDateSerializer(serializers.Serializer):
    start_date = serializers.DateTimeField()
    end_date = serializers.DateTimeField()
    total_price = serializers.DecimalField(max_digits=10, decimal_places=2)


class RecurrencePreviewResponseSerializer(serializers.Serializer):
    source_rental = serializers.UUIDField()
    frequency = serializers.CharField()
    occurrences = serializers.IntegerField()
    total_price = serializers.DecimalField(max_digits=12, decimal_places=2)
    dates = RecurrenceDateSerializer(many=True)


class RecurrenceResponseSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    source_rental = serializers.UUIDField()
    first_start_date = serializers.DateField()
    frequency = serializers.CharField()
    occurrences = serializers.IntegerField()
    total_price = serializers.DecimalField(max_digits=12, decimal_places=2)
    reservation_expires_at = serializers.DateTimeField()
    rentals = RentalOutputSerializer(many=True)


@extend_schema(
    tags=['Locações'], summary='Prévia da recorrência de uma locação',
    description='Simula 2 a 12 novas reservas semanais, quinzenais ou mensais usando preços atuais. Apenas o locatário da origem pode solicitar. A prévia não bloqueia datas.',
    request=RecurrencePreviewRequestSerializer, responses={200: RecurrencePreviewResponseSerializer, **error_responses(400, 401, 403, 404, 409)},
    examples=[OpenApiExample("Prévia de três reservas mensais", value=RECURRENCE_EXAMPLE,
                             description=RECURRENCE_EXAMPLE_DESCRIPTION, request_only=True)],
)
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def recurrence_preview(request, pk):
    source = source_for_user(pk, request.user)
    serializer = RecurrencePreviewRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    return Response(preview_response(build_preview(source, serializer.validated_data)))


@extend_schema(
    tags=['Locações'], summary='Programar recorrência de aluguel',
    description='Revalida toda a série em transação única. idempotency_key recupera a mesma tentativa após falha de rede; conflito em qualquer ocorrência impede criação parcial. Cada reserva exige pagamento próprio antes da expiração, sem débito automático.',
    request=RecurrenceCreateRequestSerializer, responses={201: RecurrenceResponseSerializer, **error_responses(400, 401, 403, 404, 409)},
    examples=[OpenApiExample("Criar três reservas mensais", value={
        **RECURRENCE_EXAMPLE, "idempotency_key": "7d6d72fc-4835-4650-a6b3-16c5153d207c",
    }, description=RECURRENCE_EXAMPLE_DESCRIPTION + " Gere uma chave UUID por tentativa; reutilize somente ao repetir a mesma operação.", request_only=True)],
)
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def recurrence_create(request, pk):
    serializer = RecurrenceCreateRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    series = create_recurrence(pk, request.user, serializer.validated_data)
    return Response(series_response(series), status=201)
