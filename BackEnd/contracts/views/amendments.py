from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.schemas import error_responses

from contracts.amendments import AmendmentInputSerializer, AmendmentOutputSerializer, AmendmentService


class ContractAmendmentsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Contratos"], summary="Listar propostas de alteração",
                   description="Lista o histórico de propostas de datas do contrato para seus participantes ou administrador.",
                   responses={200: AmendmentOutputSerializer(many=True), **error_responses(401, 403, 404)})
    def get(self, request, pk):
        return Response(AmendmentOutputSerializer(AmendmentService.list(pk, actor=request.user), many=True).data)

    @extend_schema(tags=["Contratos"], summary="Propor alteração das datas",
                   description="Registra novas datas para aceite da outra parte. A proposta preserva a duração e o preço acordado; não altera a reserva antes da aprovação.",
                   request=AmendmentInputSerializer, responses={201: AmendmentOutputSerializer, **error_responses(400, 401, 403, 404, 409)})
    def post(self, request, pk):
        return Response(AmendmentOutputSerializer(AmendmentService.propose(pk, request.data, actor=request.user)).data, status=201)


class ContractAmendmentDecisionView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Contratos"], summary="Decidir uma proposta de alteração",
                   description="accept aprova pela outra parte, revalida a agenda e cria revisão; reject rejeita; withdraw retira pelo proponente. Uma revisão nova exige novos aceites.",
                   request=None, responses={200: AmendmentOutputSerializer, **error_responses(400, 401, 403, 404, 409)})
    def post(self, request, pk, amendment_id, action):
        return Response(AmendmentOutputSerializer(AmendmentService.decide(pk, amendment_id, action, actor=request.user)).data)
