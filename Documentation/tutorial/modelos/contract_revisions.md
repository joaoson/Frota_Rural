# Revisões de contrato · `ContractRevisions`

Pré-requisitos: [tabela](../00_tabela_e_tres_registros.md), [API comum](../01_api_services_e_rotas.md) e [frontend](../02_frontend_repository_store_componente.md).

| Ponto | Arquivo ou valor |
| --- | --- |
| Modelo existente | `BackEnd/contracts/models.py` → `ContractRevisions` |
| Tabela | `contract_revisions` |
| Fluxo original | `BackEnd/contracts/revisions.py` |
| Tela original relacionada | `FrontEnd/src/pages/contracts/Contrato.tsx` |
| Componente do exercício | `FrontEnd/src/features/autoria/components/CategoriaEditor.tsx` |
| API nova | `/api/autoria/contract_revisions/<ID>` |

```python
# Append-only: incluir a categoria somente em uma NOVA revisão pelo fluxo existente; PATCH deve retornar 405.
```

## 1 Adicionar a FK

```python
# BackEnd/contracts/models.py — dentro de ContractRevisions, antes de class Meta.
categoria_autoria = models.ForeignKey(
    "autoria.CategoriaAutoria", on_delete=models.PROTECT,
    null=True, blank=True, related_name="+",
)
```

```bash
# Rodar depois de autoria.0002_categorias_iniciais.
docker exec "$AUTORIA_BACKEND" python manage.py makemigrations contracts
docker exec "$AUTORIA_BACKEND" python manage.py migrate --plan
docker exec "$AUTORIA_BACKEND" python manage.py migrate
# A migration gerada deve ter AddField e dependência de autoria.
```

## 2 Service do vínculo

<!-- file: BackEnd/contracts/autoria_contract_revisions_services.py -->
```python
from django.db.models import Q
from django.shortcuts import get_object_or_404
from contracts.models import ContractRevisions


class ContractRevisionsCategoriaService:
    @staticmethod
    def _queryset(actor):
        if actor.role == "admin":
            return ContractRevisions.objects.all()
        return ContractRevisions.objects.filter(Q(contract__rental__lessee=actor) | Q(contract__rental__postings__machinery__owner=actor))

    @staticmethod
    def obter(pk, *, actor):
        return get_object_or_404(
            ContractRevisionsCategoriaService._queryset(actor).select_related("categoria_autoria"), pk=pk,
        )
```

## 3 View e rota

<!-- file: BackEnd/contracts/autoria_contract_revisions_views.py -->
```python
from autoria.views import RegistroCategoriaView
from contracts.autoria_contract_revisions_services import ContractRevisionsCategoriaService


class ContractRevisionsCategoriaView(RegistroCategoriaView):
    service = ContractRevisionsCategoriaService
    http_method_names = ["get", "head", "options"]
```

`BackEnd/autoria/urls.py` — acrescentar o import e o `path` na lista existente:

```python
from contracts.autoria_contract_revisions_views import ContractRevisionsCategoriaView

# Dentro de urlpatterns:
path("autoria/contract_revisions/<uuid:pk>", ContractRevisionsCategoriaView.as_view(), name="autoria_contract_revisions"),
```

## 4 Gravar somente durante a criação

Antes, aplique o guia de [Contracts](contracts.md). A seleção é salva no contrato e copiada quando o fluxo real criar uma nova evidência. Registros antigos continuam sem categoria.

`BackEnd/contracts/revisions.py` → `freeze_revision`: inserir o argumento abaixo na chamada `ContractRevisions.objects.create(...)` já existente.

```python
# Apenas metadado administrativo; não representa cláusula ou prova de aceite.
categoria_autoria=contract.categoria_autoria,
```
```text
1. Abrir /autoria/contracts/ID_DO_CONTRATO e salvar uma categoria.
2. Completar o pagamento de teste para congelar a revisão inicial, ou aceitar um aditivo válido.
3. Copiar o ID NOVO de contract_revisions usando o comando abaixo.
4. Abrir /autoria/contract_revisions/ID_NOVO; a página é somente leitura.
5. PATCH neste recurso deve retornar 405, inclusive para admin.
Não desativar triggers, não usar UPDATE direto e não recalcular evidências antigas.
```

## 5 Identificar o registro e conferir a FK

```bash
docker exec "$AUTORIA_BACKEND" python manage.py shell -c 'from contracts.models import ContractRevisions; print(list(ContractRevisions.objects.values_list("pk", flat=True)[:10]))'
# Se a lista estiver vazia, crie um registro pelo fluxo original indicado acima.
# Use um ID ao qual a conta autenticada tenha acesso.
```
```sql
SELECT r.id, r.categoria_autoria_id, c.nome AS categoria_nome
FROM contract_revisions AS r
LEFT JOIN categorias_autoria AS c ON c.id = r.categoria_autoria_id
ORDER BY r.id;
```
```bash
AUTORIA_ID='COLE_O_ID_NOVO_AQUI'
curl --fail-with-body "$AUTORIA_API/autoria/contract_revisions/$AUTORIA_ID" \
  -H "Authorization: Bearer $AUTORIA_TOKEN"
# categoria_id é a escolha copiada do contrato no instante da criação.
```

## 6 Integrar na tela original quando solicitado

Ponto de partida: `FrontEnd/src/pages/contracts/Contrato.tsx`. Renderize fora de outro `<form>` e passe o ID de **ContractRevisions**, não o ID do objeto pai.

```tsx
import { CategoriaEditor } from "@/features/autoria/components/CategoriaEditor";

export function ContractRevisionsCategoria({ id }: { id: string }) {
  return <CategoriaEditor key={id} recurso="contract_revisions" id={id} somenteLeitura />;
}
```

## 7 Conferências

```text
[ ] A FK está em contract_revisions, não apenas no state do React.
[ ] A tabela nova contém exatamente os três registros da migration.
[ ] GET devolve ID e nome, sem campos sensíveis do modelo original.
[ ] PATCH retorna 405; uma criação pelo fluxo real grava a nova FK.
[ ] Recarregar a página mantém o valor gravado.
[ ] Append-only: incluir a categoria somente em uma NOVA revisão pelo fluxo existente; PATCH deve retornar 405.
```
