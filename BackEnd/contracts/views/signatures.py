from uuid import UUID

from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from common.request import authenticated_user
from common.schemas import error_response, error_responses
from contracts import signature_evidence
from contracts.serializer import (
    ContractOtpOutputSerializer,
    ContractOtpRequestInputSerializer,
    ContractSignInputSerializer,
    ContractSignOutputSerializer,
)
from contracts.services import ContractSignatureService
from contracts.views.contracts import ACCEPTS_RENTAL_ID, CONTRACT_NOT_FOUND, TAGS


class ContractSignatureOtpView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Solicitar código de assinatura",
        description=(
            "Envia ao e-mail da parte um código de uso único que precisa ser informado no aceite. "
            "Cada novo pedido invalida o código anterior daquele papel.\n\n"
            f"{ACCEPTS_RENTAL_ID}"
        ),
        request=ContractOtpRequestInputSerializer,
        responses={
            200: ContractOtpOutputSerializer,
            400: error_response(400, "Papel inválido ou parte sem e-mail cadastrado."),
            403: error_response(403, "O usuário autenticado não é a parte daquele papel."),
            404: CONTRACT_NOT_FOUND,
            **error_responses(502),
        },
    )
    def post(self, request: Request, pk: UUID) -> Response:
        dispatch = ContractSignatureService.request_otp(
            pk, request.data, requester=authenticated_user(request)
        )
        return Response(ContractOtpOutputSerializer(dispatch).data, status=status.HTTP_200_OK)


class ContractSignView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Assinar contrato digitalmente",
        description=(
            "Registra o aceite do locador ou do locatário com a evidência do momento (hash do "
            "documento, IP, user-agent e OTP). Enquanto só uma parte assinou, o contrato fica em "
            "`pending_signatures` e a locação em `active`; quando ambas assinam, os dois passam a "
            f"`signed`.\n\n{ACCEPTS_RENTAL_ID}"
        ),
        request=ContractSignInputSerializer,
        responses={
            200: ContractSignOutputSerializer,
            400: error_response(400, "Papel inválido ou código ausente, expirado ou incorreto."),
            403: error_response(403, "O usuário autenticado não é a parte daquele papel."),
            404: CONTRACT_NOT_FOUND,
            409: error_response(409, "Esta parte já assinou o contrato."),
        },
        examples=[
            OpenApiExample(
                "Assinatura pelo Locatário",
                summary="Exemplo de assinatura da parte que vai alugar",
                value={
                    "role": "locatario",
                    "name": "João da Silva - CPF 123.456.789-00",
                    "otp": "482913",
                },
                request_only=True,
            ),
            OpenApiExample(
                "Assinatura pelo Locador",
                summary="Exemplo de assinatura do dono da máquina",
                value={
                    "role": "locador",
                    "name": "Tratores & Cia - CNPJ 12.345.678/0001-99",
                    "otp": "105377",
                },
                request_only=True,
            ),
        ],
    )
    def post(self, request: Request, pk: UUID) -> Response:
        result = ContractSignatureService.sign(
            pk,
            request.data,
            requester=authenticated_user(request),
            ip_address=signature_evidence.client_ip(request),
            user_agent=signature_evidence.client_user_agent(request),
        )
        serializer = ContractSignOutputSerializer(
            result.contract, context={"signature": result.signature}
        )
        return Response(serializer.data, status=status.HTTP_200_OK)
