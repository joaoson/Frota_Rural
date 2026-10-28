from collections.abc import Sequence

from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema
from common.schemas import error_responses
from rest_framework import status
from rest_framework.authentication import BaseAuthentication
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from payments.services import PaymentService


class StripeWebhookView(APIView):
    """Recebe os eventos do Stripe.

    Sem autenticação da API: quem autentica a chamada é a assinatura
    `Stripe-Signature`, conferida pelo service. O corpo é lido cru de
    `request.body` — ler `request.data` antes quebraria a verificação.
    """

    authentication_classes: Sequence[type[BaseAuthentication]] = ()
    permission_classes: Sequence[type[BasePermission]] = (AllowAny,)

    @extend_schema(tags=["Pagamentos"], summary="Receber eventos assinados do Stripe",
                   description="Endpoint servidor a servidor. Valida Stripe-Signature sobre os bytes originais do corpo; não usa JWT. Confirma pagamentos e estornos de forma idempotente, inclusive eventos repetidos ou atrasados. HTTP 200 tem corpo vazio e apenas confirma o processamento do evento; consulte a locação para saber seu estado.",
                   auth=[], parameters=[OpenApiParameter("Stripe-Signature", str, OpenApiParameter.HEADER, required=True)],
                   request=OpenApiTypes.OBJECT, responses={200: None, **error_responses(400, 503)})
    def post(self, request: Request) -> Response:
        PaymentService.handle_webhook(request.body, request.headers.get("Stripe-Signature", ""))
        return Response(status=status.HTTP_200_OK)
