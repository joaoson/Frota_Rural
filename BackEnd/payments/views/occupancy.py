from uuid import UUID

from drf_spectacular.utils import extend_schema

from common.schemas import error_response
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from payments.serializer import OccupancyOutputSerializer, QuoteInputSerializer, QuoteOutputSerializer
from payments.services import PaymentService


class PostingOccupancyView(APIView):
    @extend_schema(
        tags=["Anúncios"],
        summary="Períodos já reservados de um anúncio",
        description=(
            "Locações confirmadas ocupam o período até o fim; reservas ainda não pagas "
            "seguram as datas por 30 minutos."
        ),
        responses={200: OccupancyOutputSerializer},
    )
    def get(self, request: Request, pk: UUID) -> Response:
        periods = PaymentService.list_occupied_periods(pk)
        return Response(
            OccupancyOutputSerializer({"ocupados": periods}).data, status=status.HTTP_200_OK
        )


class PostingQuoteView(APIView):
    @extend_schema(
        tags=["Anúncios"],
        summary="Cotação de uma locação",
        description=(
            "Valor calculado no servidor para o período: diária fixa (tarifa × 8 h) "
            "por dia de calendário, mais a taxa da plataforma. É o mesmo cálculo que a "
            "reserva congela; leituras de horímetro não alteram o valor."
        ),
        parameters=[QuoteInputSerializer],
        responses={
            200: QuoteOutputSerializer,
            400: error_response(400, "A data de fim deve ser posterior à data de início."),
            404: error_response(404, "Anúncio não encontrado."),
        },
    )
    def get(self, request: Request, pk: UUID) -> Response:
        quote = PaymentService.quote(pk, request.query_params)
        return Response(QuoteOutputSerializer(quote).data, status=status.HTTP_200_OK)
