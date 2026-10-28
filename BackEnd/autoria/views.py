from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.request import authenticated_user
from autoria.serializers import (
    CategoriaOutputSerializer, VinculoInputSerializer, VinculoOutputSerializer,
)
from autoria.services import CategoriaAutoriaService


class CategoriaAutoriaListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Autoria"], responses={200: CategoriaOutputSerializer(many=True)})
    def get(self, request):
        return Response(CategoriaOutputSerializer(
            CategoriaAutoriaService.listar(), many=True,
        ).data)


class RegistroCategoriaView(APIView):
    permission_classes = [IsAuthenticated]
    service = None  # Definido pela subclasse do modelo escolhido.

    @extend_schema(tags=["Autoria"], responses={200: VinculoOutputSerializer})
    def get(self, request, pk):
        registro = self.service.obter(pk, actor=authenticated_user(request))
        return Response(VinculoOutputSerializer(registro).data)

    @extend_schema(tags=["Autoria"], request=VinculoInputSerializer,
                   responses={200: VinculoOutputSerializer})
    def patch(self, request, pk):
        registro = self.service.salvar(pk, request.data, actor=authenticated_user(request))
        return Response(VinculoOutputSerializer(registro).data)
