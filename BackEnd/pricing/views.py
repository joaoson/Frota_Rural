import logging

from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .serializer import (
    SuggestionRequestSerializer,
    SuggestionResponseSerializer,
    SuggestionUnavailableSerializer,
)
from .service import SuggestionUnavailable, build_suggestion, get_machine

logger = logging.getLogger(__name__)


@extend_schema(
    tags=['Precificação'],
    summary="Sugerir valor por hora",
    description=(
        "Pesquisa o valor de mercado da máquina (marca, modelo e ano) e converte esse "
        "valor em uma tarifa por hora faturada, com a composição do custo.\n\n"
        "**A tarifa é por hora faturada, não por hora de horímetro**: a plataforma cobra "
        "8 h por dia de reserva. O valor devolvido é o bruto do locador; "
        "`locatario_paga_brl_hora` já inclui a taxa da plataforma.\n\n"
        "É uma sugestão: quem define o preço do anúncio é o locador. Quando não há dado "
        "confiável, o endpoint responde 422 em vez de arriscar um número."
    ),
    request=SuggestionRequestSerializer,
    responses={
        200: SuggestionResponseSerializer,
        400: OpenApiResponse(description="Requisição inválida."),
        403: OpenApiResponse(description="A máquina pertence a outro locador."),
        404: OpenApiResponse(description="Máquina não encontrada."),
        422: OpenApiResponse(
            response=SuggestionUnavailableSerializer,
            description="Sem dado confiável para sugerir um valor.",
        ),
    },
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def pricing_suggest(request):
    serializer = SuggestionRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    machine = get_machine(serializer.validated_data["machinery"])
    if machine is None:
        return Response(status=status.HTTP_404_NOT_FOUND)

    # Cada sugestão dispara uma pesquisa externa paga. Restringir ao dono evita
    # que um usuário autenticado varra o catálogo alheio às nossas custas.
    if str(machine.owner_id) != str(request.user.id):
        return Response(
            {"error": "Esta máquina pertence a outro locador."},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        suggestion = build_suggestion(
            machine,
            includes_fuel=serializer.validated_data["includes_fuel"],
            includes_operator=serializer.validated_data["includes_operator"],
        )
    except SuggestionUnavailable as exc:
        # 422 e não 400: a requisição está correta: o que falta é dado de
        # mercado. O front usa esta distinção para orientar o locador.
        return Response({"error": str(exc)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

    return Response(
        {
            "suggestion_id": suggestion.suggestion_id,
            # Valores como string, como o DRF já serializa `DecimalField` no
            # resto da API — número em ponto flutuante para dinheiro seria a
            # única inconsistência de formato do cliente.
            "sugerido_brl_hora": str(suggestion.suggested_hourly_rate),
            "faixa_brl_hora": [str(suggestion.range_min), str(suggestion.range_max)],
            "custo_brl_hora": str(suggestion.cost_hourly_rate),
            "locatario_paga_brl_hora": str(suggestion.lessee_pays_hourly),
            "equivalente_diaria_brl": str(suggestion.daily_equivalent),
            "composicao": suggestion.breakdown,
            "premissas": suggestion.assumptions,
            "fontes": suggestion.sources,
            "confianca": suggestion.confidence,
            "origem": suggestion.source,
            "versao_parametros": suggestion.params_version,
        },
        status=status.HTTP_200_OK,
    )
