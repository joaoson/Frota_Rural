# API comum de categorias e vínculo

Execute depois de [criar a tabela](00_tabela_e_tres_registros.md). Cada guia de modelo adiciona seu service e sua rota.

## Serializers

<!-- file: BackEnd/autoria/serializers.py -->
```python
from rest_framework import serializers
from autoria.models import CategoriaAutoria


class CategoriaOutputSerializer(serializers.ModelSerializer):
    class Meta:
        model = CategoriaAutoria
        fields = ["id", "nome"]
        read_only_fields = fields


class VinculoInputSerializer(serializers.Serializer):
    categoria_id = serializers.PrimaryKeyRelatedField(
        queryset=CategoriaAutoria.objects.all(), source="categoria_autoria",
    )

    def validate(self, attrs):
        extras = set(self.initial_data) - {"categoria_id"}
        if extras:
            raise serializers.ValidationError("Envie somente categoria_id.")
        return attrs


class VinculoOutputSerializer(serializers.Serializer):
    id = serializers.CharField()
    categoria_id = serializers.UUIDField(source="categoria_autoria_id", allow_null=True)
    categoria_nome = serializers.CharField(
        source="categoria_autoria.nome", allow_null=True, default=None,
    )
```

## Service do catálogo

<!-- file: BackEnd/autoria/services.py -->
```python
from autoria.models import CategoriaAutoria


class CategoriaAutoriaService:
    @staticmethod
    def listar():
        return CategoriaAutoria.objects.order_by("nome")
```

## Views

<!-- file: BackEnd/autoria/views.py -->
```python
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
```

## Rotas

<!-- file: BackEnd/autoria/urls.py -->
```python
from django.urls import path
from autoria.views import CategoriaAutoriaListView

urlpatterns = [
    path("autoria/categorias", CategoriaAutoriaListView.as_view(), name="autoria_categorias"),
]
# Os guias dos modelos acrescentam imports e paths neste arquivo.
```

`BackEnd/djangoapi/urls.py` — acrescentar em `urlpatterns`; `include` e `path` já são importados:

```python
path(BASE_PATH, include("autoria.urls")),
```

```text
GET   /api/autoria/categorias               -> as 3 opções do banco
GET   /api/autoria/users/<UUID>              -> vínculo persistido
PATCH /api/autoria/users/<UUID>              -> {"categoria_id": "UUID"}

Os endpoints de vínculo só existem depois de copiar o guia do modelo.
O endpoint novo recebe somente a FK; os fluxos de negócio existentes continuam nos seus services.
```
