from uuid import UUID

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from common.request import authenticated_user
from common.schemas import error_response
from contracts.serializer import (
    ContractDocumentOutputSerializer,
    ContractEvidenceOutputSerializer,
    ContractOutputSerializer,
)
from contracts.services import ContractService

TAGS = ["Contratos"]
CONTRACT_NOT_FOUND = error_response(404, "Contrato não encontrado.")
ACCEPTS_RENTAL_ID = "O identificador aceito é o do contrato **ou** o da locação associada."


class ContractListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Listar contratos",
        description="Retorna todos os contratos gerados no sistema, já com locatário, anúncio e maquinário resolvidos.",
        responses={200: ContractOutputSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        contracts = ContractService.list(actor=authenticated_user(request))
        return Response(
            ContractOutputSerializer(contracts, many=True).data, status=status.HTTP_200_OK
        )


class ContractDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Visualizar documento do contrato",
        description=(
            "Retorna os dados já agregados e formatados (valores em pt-BR, datas e prazos "
            "calculados) prontos para renderizar o PDF do contrato de locação, junto do resumo "
            f"das assinaturas já registradas.\n\n{ACCEPTS_RENTAL_ID}"
        ),
        responses={200: ContractDocumentOutputSerializer, 404: CONTRACT_NOT_FOUND},
    )
    def get(self, request: Request, pk: UUID) -> Response:
        document = ContractService.get_document(pk, actor=authenticated_user(request))
        return Response(ContractDocumentOutputSerializer(document).data, status=status.HTTP_200_OK)


class ContractEvidenceView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Trilha de auditoria da assinatura",
        description=(
            "Reúne qual documento foi aceito (hash e versão), por quem, quando e de onde, e a "
            "conferência do encadeamento que atesta que nenhuma evidência foi alterada.\n\n"
            f"{ACCEPTS_RENTAL_ID}"
        ),
        responses={200: ContractEvidenceOutputSerializer, 404: CONTRACT_NOT_FOUND},
    )
    def get(self, request: Request, pk: UUID) -> Response:
        evidence = ContractService.get_evidence(pk, actor=authenticated_user(request))
        return Response(ContractEvidenceOutputSerializer(evidence).data, status=status.HTTP_200_OK)
