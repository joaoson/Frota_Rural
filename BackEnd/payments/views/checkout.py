from uuid import UUID

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from common.schemas import error_response
from payments.serializer import CheckoutOutputSerializer, PaymentStatusOutputSerializer
from payments.services import PaymentService

TAGS = ["Pagamentos"]


class RentalCheckoutView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Iniciar pagamento de uma locação",
        description=(
            "Confere se o período continua livre, recalcula o valor no servidor a partir "
            "da diária do anúncio e devolve a URL da página de pagamento do Stripe."
        ),
        request=None,
        responses={
            200: CheckoutOutputSerializer,
            400: error_response(400, "Não foi possível calcular o valor da locação."),
            404: error_response(404, "Locação não encontrada."),
            409: error_response(409, "O período escolhido já está reservado."),
            502: error_response(502, "Falha na comunicação com o Stripe."),
            503: error_response(503, "Integração de pagamento ainda não configurada."),
        },
    )
    def post(self, request: Request, pk: UUID) -> Response:
        checkout = PaymentService.create_checkout(pk, user=request.user)
        return Response(CheckoutOutputSerializer(checkout).data, status=status.HTTP_200_OK)


class RentalPaymentStatusView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Consultar o pagamento de uma locação",
        description="Situação do pagamento mais recente da locação.",
        responses={
            200: PaymentStatusOutputSerializer,
            404: error_response(404, "Nenhum pagamento encontrado para esta locação."),
        },
    )
    def get(self, request: Request, pk: UUID) -> Response:
        payment = PaymentService.get_latest(pk, user=request.user)
        return Response(PaymentStatusOutputSerializer(payment).data, status=status.HTTP_200_OK)
