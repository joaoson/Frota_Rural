from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from contracts.amendments import AmendmentInputSerializer, AmendmentOutputSerializer, AmendmentService


class ContractAmendmentsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Contratos"], responses={200: AmendmentOutputSerializer(many=True)})
    def get(self, request, pk):
        return Response(AmendmentOutputSerializer(AmendmentService.list(pk, actor=request.user), many=True).data)

    @extend_schema(tags=["Contratos"], request=AmendmentInputSerializer, responses={201: AmendmentOutputSerializer})
    def post(self, request, pk):
        return Response(AmendmentOutputSerializer(AmendmentService.propose(pk, request.data, actor=request.user)).data, status=201)


class ContractAmendmentDecisionView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Contratos"], responses={200: AmendmentOutputSerializer})
    def post(self, request, pk, amendment_id, action):
        return Response(AmendmentOutputSerializer(AmendmentService.decide(pk, amendment_id, action, actor=request.user)).data)
