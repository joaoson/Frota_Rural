# Estornos · `Refunds`

Pré-requisitos: [tabela](../00_tabela_e_tres_registros.md), [API comum](../01_api_services_e_rotas.md) e [frontend](../02_frontend_repository_store_componente.md).

| Ponto | Arquivo ou valor |
| --- | --- |
| Modelo existente | `BackEnd/payments/models.py` → `Refunds` |
| Tabela | `refunds` |
| Fluxo original | `BackEnd/payments/refunds.py` |
| Tela original relacionada | `FrontEnd/src/pages/contracts/AnaliseLocacao.tsx` |
| Componente do exercício | `FrontEnd/src/features/autoria/components/CategoriaEditor.tsx` |
| API nova | `/api/autoria/refunds/<ID>` |

```python
# Classificar não processa estorno; não chamar Stripe nem modificar amount/status.
```

## 1 Adicionar a FK

```python
# BackEnd/payments/models.py — dentro de Refunds, antes de class Meta.
categoria_autoria = models.ForeignKey(
    "autoria.CategoriaAutoria", on_delete=models.PROTECT,
    null=True, blank=True, related_name="+",
)
```

```bash
# Rodar depois de autoria.0002_categorias_iniciais.
docker exec "$AUTORIA_BACKEND" python manage.py makemigrations payments
docker exec "$AUTORIA_BACKEND" python manage.py migrate --plan
docker exec "$AUTORIA_BACKEND" python manage.py migrate
# A migration gerada deve ter AddField e dependência de autoria.
```

## 2 Service do vínculo

<!-- file: BackEnd/payments/autoria_refunds_services.py -->
```python
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied
from payments.models import Refunds
from autoria.serializers import VinculoInputSerializer


class RefundsCategoriaService:
    @staticmethod
    def _queryset(actor):
        if actor.role == "admin":
            return Refunds.objects.all()
        raise PermissionDenied("Apenas administradores acessam esta classificação.")

    @staticmethod
    def obter(pk, *, actor):
        return get_object_or_404(
            RefundsCategoriaService._queryset(actor).select_related("categoria_autoria"), pk=pk,
        )

    @staticmethod
    @transaction.atomic
    def salvar(pk, data, *, actor):
        registro = get_object_or_404(
            RefundsCategoriaService._queryset(actor).select_for_update(of=("self",)), pk=pk,
        )
        serializer = VinculoInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        registro.categoria_autoria = serializer.validated_data["categoria_autoria"]
        registro.save(update_fields=["categoria_autoria"])
        return registro
```

## 3 View e rota

<!-- file: BackEnd/payments/autoria_refunds_views.py -->
```python
from autoria.views import RegistroCategoriaView
from payments.autoria_refunds_services import RefundsCategoriaService


class RefundsCategoriaView(RegistroCategoriaView):
    service = RefundsCategoriaService
```

`BackEnd/autoria/urls.py` — acrescentar o import e o `path` na lista existente:

```python
from payments.autoria_refunds_views import RefundsCategoriaView

# Dentro de urlpatterns:
path("autoria/refunds/<uuid:pk>", RefundsCategoriaView.as_view(), name="autoria_refunds"),
```

## 4 Gravar e exibir no frontend

```text
1. Fazer login com admin@example.test.
2. Abrir http://localhost:5175/autoria/refunds/ID_REAL.
3. Categoria -> selecionar uma das três opções -> Salvar categoria.
4. Ler novamente do banco -> F5 -> verificar Categoria persistida.
O CategoriaEditor já está conectado ao Repository, Store, GET e PATCH da API.
```

## 5 Identificar o registro e conferir a FK

```bash
docker exec "$AUTORIA_BACKEND" python manage.py shell -c 'from payments.models import Refunds; print(list(Refunds.objects.values_list("pk", flat=True)[:10]))'
# Se a lista estiver vazia, crie um registro pelo fluxo original indicado acima.
# Use um ID ao qual a conta autenticada tenha acesso.
```
```sql
SELECT r.id, r.categoria_autoria_id, c.nome AS categoria_nome
FROM refunds AS r
LEFT JOIN categorias_autoria AS c ON c.id = r.categoria_autoria_id
ORDER BY r.id;
```
```bash
# TOKEN: login do passo 03_validacao_e_erros.md; ID: copiado do banco.
AUTORIA_ID='COLE_O_ID_REAL_AQUI'
curl --fail-with-body -X PATCH "$AUTORIA_API/autoria/refunds/$AUTORIA_ID" \
  -H "Authorization: Bearer $AUTORIA_TOKEN" -H 'Content-Type: application/json' \
  -d '{"categoria_id":"33333333-3333-4333-8333-333333333333"}'
curl --fail-with-body "$AUTORIA_API/autoria/refunds/$AUTORIA_ID" \
  -H "Authorization: Bearer $AUTORIA_TOKEN"
# GET deve devolver categoria_nome = Prioridade.
```

## 6 Integrar na tela original quando solicitado

Ponto de partida: `FrontEnd/src/pages/contracts/AnaliseLocacao.tsx`. Renderize fora de outro `<form>` e passe o ID de **Refunds**, não o ID do objeto pai.

```tsx
import { CategoriaEditor } from "@/features/autoria/components/CategoriaEditor";

export function RefundsCategoria({ id }: { id: string }) {
  return <CategoriaEditor key={id} recurso="refunds" id={id} />;
}
```

## 7 Conferências

```text
[ ] A FK está em refunds, não apenas no state do React.
[ ] A tabela nova contém exatamente os três registros da migration.
[ ] GET devolve ID e nome, sem campos sensíveis do modelo original.
[ ] PATCH com categoria inexistente retorna 400; outro usuário sem acesso recebe 403/404.
[ ] Recarregar a página mantém o valor gravado.
[ ] Classificar não processa estorno; não chamar Stripe nem modificar amount/status.
```
