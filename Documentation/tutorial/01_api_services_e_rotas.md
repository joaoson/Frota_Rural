# Catálogo da tabela nova; gravação pelo service existente

## 1 Ajustar a saída já criada

`BackEnd/autoria/serializers.py` — substituir **somente** `CategoriaOutputSerializer` (linhas 5–9). Os serializers `Vinculo*` não participam do fluxo recomendado.


```python
class CategoriaOutputSerializer(serializers.ModelSerializer):
    nome = serializers.CharField(source="Genero", read_only=True)

    class Meta:
        model = Genero
        fields = ["id", "nome"]
        read_only_fields = fields
```

## 2 Service do catálogo já existente

`BackEnd/autoria/services.py` — manter:


```python
from autoria.models import Genero

class CategoriaAutoriaService:
    @staticmethod
    def listar():
        return Genero.objects.order_by("Genero")
```

## 3 View e rota já existentes

`BackEnd/autoria/views.py` — a lista deve usar `IsAuthenticated`:


```python
class CategoriaAutoriaListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        registros = CategoriaAutoriaService.listar()
        return Response(CategoriaOutputSerializer(registros, many=True).data)
```

`BackEnd/autoria/urls.py` — manter `path("autoria/categorias", CategoriaAutoriaListView.as_view(), name="autoria_categorias")`.

`BackEnd/djangoapi/urls.py` — `path(BASE_PATH, include("autoria.urls"))` já está registrado.

```text
GET /api/autoria/categorias
→ [{"id": "11111111-1111-4111-8111-111111111111", "nome": "Masculino"}, ...]

PATCH /api/users/<id>
→ {"categoria_autoria": "11111111-1111-4111-8111-111111111111"}
→ UserDetailView.patch → UserService.update → UserUpdateInputSerializer.save
```

## 4 Em cada modelo escolhido

1. FK no modelo e migration.
2. Entrada no serializer utilizado pelo service existente.
3. Gravação no `serializer.save()` existente ou no `objects.create()` indicado no guia do modelo.
4. Saída no serializer/projeção existente.
5. Campo no schema Zod, mapper e formulário existente.

Não usar `RegistroCategoriaView` nem criar `autoria_users_services.py` para este roteiro. O cadastro de categorias é o único endpoint novo necessário no exemplo de usuários.
