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
            "Exige pagamento confirmado e prazo de assinatura vigente. Primeiro leia "
            "GET /api/contracts/{id} e envie `revisao.id` em `revision_id`; o código fica "
            "vinculado à revisão e ao usuário autenticado. Cada novo pedido invalida o código "
            "anterior daquele papel. A resposta informa o e-mail mascarado e a validade em "
            "segundos, nunca o código. Substitua o UUID ilustrativo pela revisão lida.\n\n"
            f"{ACCEPTS_RENTAL_ID}"
        ),
        request=ContractOtpRequestInputSerializer,
        responses={
            200: ContractOtpOutputSerializer,
            400: error_response(400, "Papel inválido ou parte sem e-mail cadastrado."),
            403: error_response(403, "O usuário autenticado não é a parte daquele papel."),
            404: CONTRACT_NOT_FOUND,
            409: error_response(409, "Revisão ausente/desatualizada (stale_revision), prazo encerrado, pagamento pendente ou parte já assinou."),
            **error_responses(502),
        },
        examples=[OpenApiExample("Código para a revisão lida", value={
            "role": "locatario", "revision_id": "3b0ca71c-8eed-45b0-9c31-6f2d5ec18c71",
        }, request_only=True)],
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
            "`signed`.\n\n"
            "Antes de assinar, leia GET /api/contracts/{id}, informe `revisao.id` em "
            "`revision_id` e peça o OTP para essa revisão. Substitua os códigos ilustrativos "
            "pelo código recebido por e-mail; cada parte usa a própria conta. Pagamento "
            "confirmado e prazo vigente são pré-requisitos. Se receber `stale_revision`, "
            "releia o documento e solicite outro OTP antes de aceitar.\n\n"
            f"{ACCEPTS_RENTAL_ID}"
        ),
        request=ContractSignInputSerializer,
        responses={
            200: ContractSignOutputSerializer,
            400: error_response(400, "Papel inválido ou código ausente, expirado ou incorreto."),
            403: error_response(403, "O usuário autenticado não é a parte daquele papel."),
            404: CONTRACT_NOT_FOUND,
            409: error_response(409, "Parte já assinou (already_signed), revisão desatualizada (stale_revision), prazo encerrado ou pagamento pendente."),
        },
        examples=[
            OpenApiExample(
                "Assinatura pelo Locatário",
                summary="Exemplo de assinatura da parte que vai alugar",
                value={
                    "role": "locatario",
                    "name": "Locatário de demonstração",
                    "otp": "482913",
                    "revision_id": "3b0ca71c-8eed-45b0-9c31-6f2d5ec18c71",
                },
                request_only=True,
            ),
            OpenApiExample(
                "Assinatura pelo Locador",
                summary="Exemplo de assinatura do dono da máquina",
                value={
                    "role": "locador",
                    "name": "Locador de demonstração",
                    "otp": "105377",
                    "revision_id": "3b0ca71c-8eed-45b0-9c31-6f2d5ec18c71",
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
