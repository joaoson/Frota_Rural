from collections.abc import Sequence

from drf_spectacular.utils import extend_schema
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

    @extend_schema(exclude=True)
    def post(self, request: Request) -> Response:
        PaymentService.handle_webhook(request.body, request.headers.get("Stripe-Signature", ""))
        return Response(status=status.HTTP_200_OK)
