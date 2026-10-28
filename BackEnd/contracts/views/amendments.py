from drf_spectacular.utils import OpenApiExample, OpenApiParameter, extend_schema
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
                   description="Registra novas datas para aceite da outra parte em uma locação paga que ainda não começou. Use revisao.id do documento em base_revision e mantenha a mesma quantidade de diárias. A proposta preserva o preço e não altera a reserva antes da aprovação; a aprovação revalida a agenda e exige novos aceites.",
                   examples=[OpenApiExample("Propor troca mantendo três diárias", value={
                       "base_revision": "3b0ca71c-8eed-45b0-9c31-6f2d5ec18c71",
                       "proposed_start": "2030-05-20T08:00:00-03:00", "proposed_end": "2030-05-22T18:00:00-03:00",
                       "reason": "Ajuste da data de plantio.",
                   }, description="Substitua a revisão e escolha datas disponíveis com a mesma quantidade de diárias da reserva original.", request_only=True)],
                   request=AmendmentInputSerializer, responses={201: AmendmentOutputSerializer, **error_responses(400, 401, 403, 404, 409)})
    def post(self, request, pk):
        return Response(AmendmentOutputSerializer(AmendmentService.propose(pk, request.data, actor=request.user)).data, status=201)


class ContractAmendmentDecisionView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Contratos"], summary="Decidir uma proposta de alteração",
                   description="accept aprova pela outra parte, revalida a agenda e cria revisão; reject rejeita; withdraw retira pelo proponente. Uma revisão nova exige novos aceites.",
                   parameters=[OpenApiParameter("action", str, OpenApiParameter.PATH, enum=["accept", "reject", "withdraw"])],
                   request=None, responses={200: AmendmentOutputSerializer, **error_responses(400, 401, 403, 404, 409)})
    def post(self, request, pk, amendment_id, action):
        return Response(AmendmentOutputSerializer(AmendmentService.decide(pk, amendment_id, action, actor=request.user)).data)
