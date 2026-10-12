from uuid import UUID

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from payments.serializer import OccupancyOutputSerializer
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
