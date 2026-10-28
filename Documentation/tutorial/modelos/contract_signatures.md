# Evidências de assinatura · `ContractSignatures`

Pré-requisitos: [tabela](../00_tabela_e_tres_registros.md), [API comum](../01_api_services_e_rotas.md) e [frontend](../02_frontend_repository_store_componente.md).

```bash
# Terminal em BackEnd/. Se estiver na raiz: cd BackEnd
source .venv/bin/activate
source ../Devops/autoria.env.sh
python manage.py verify_database
# Esperado: 127.0.0.1:5442 / frota_rural.
```

| Ponto | Arquivo ou valor |
| --- | --- |
| Modelo existente | `BackEnd/contracts/models.py` → `ContractSignatures` |
| Tabela | `contract_signatures` |
| Fluxo original | `BackEnd/contracts/signature_evidence.py` |
| Tela original relacionada | `FrontEnd/src/pages/contracts/Contrato.tsx` |
| Componente do exercício | `FrontEnd/src/features/autoria/components/CategoriaEditor.tsx` |
| API nova | `/api/autoria/contract_signatures/<ID>` |

```python
# Append-only: capturar categoria na NOVA assinatura; manter OTP, hash, encadeamento e triggers.
```

## 1 Adicionar a FK

```python
# BackEnd/contracts/models.py — dentro de ContractSignatures, antes de class Meta.
categoria_autoria = models.ForeignKey(
    "autoria.CategoriaAutoria", on_delete=models.PROTECT,
    null=True, blank=True, related_name="+",
)
```

```bash
# Rodar depois de autoria.0002_categorias_iniciais.
python manage.py makemigrations contracts
python manage.py migrate --plan
python manage.py migrate
# A migration gerada deve ter AddField e dependência de autoria.
```

## 2 Service do vínculo

<!-- file: BackEnd/contracts/autoria_contract_signatures_services.py -->
```python
from django.db.models import Q
from django.shortcuts import get_object_or_404
from contracts.models import ContractSignatures


class ContractSignaturesCategoriaService:
    @staticmethod
    def _queryset(actor):
        if actor.role == "admin":
            return ContractSignatures.objects.all()
        return ContractSignatures.objects.filter(Q(contract__rental__lessee=actor) | Q(contract__rental__postings__machinery__owner=actor))

    @staticmethod
    def obter(pk, *, actor):
        return get_object_or_404(
            ContractSignaturesCategoriaService._queryset(actor).select_related("categoria_autoria"), pk=pk,
        )
```

## 3 View e rota

<!-- file: BackEnd/contracts/autoria_contract_signatures_views.py -->
```python
from autoria.views import RegistroCategoriaView
from contracts.autoria_contract_signatures_services import ContractSignaturesCategoriaService


class ContractSignaturesCategoriaView(RegistroCategoriaView):
    service = ContractSignaturesCategoriaService
    http_method_names = ["get", "head", "options"]
```

`BackEnd/autoria/urls.py` — acrescentar o import e o `path` na lista existente:

```python
from contracts.autoria_contract_signatures_views import ContractSignaturesCategoriaView

# Dentro de urlpatterns:
path("autoria/contract_signatures/<uuid:pk>", ContractSignaturesCategoriaView.as_view(), name="autoria_contract_signatures"),
```

## 4 Gravar somente durante a criação

Antes, aplique o guia de [Contracts](contracts.md). A seleção é salva no contrato e copiada quando o fluxo real criar uma nova evidência. Registros antigos continuam sem categoria.

`BackEnd/contracts/signature_evidence.py` → `record_signature`: inserir o argumento abaixo na chamada `ContractSignatures.objects.create(...)` já existente.

```python
# Apenas metadado administrativo; não representa cláusula ou prova de aceite.
categoria_autoria=contract.categoria_autoria,
```
```text
1. Abrir /autoria/contracts/ID_DO_CONTRATO e salvar uma categoria.
2. Concluir o fluxo existente de assinatura: conta da parte + pagamento confirmado + revisão atual + OTP.
3. Copiar o ID NOVO de contract_signatures usando o comando abaixo.
4. Abrir /autoria/contract_signatures/ID_NOVO; a página é somente leitura.
5. PATCH neste recurso deve retornar 405, inclusive para admin.
Não desativar triggers, não usar UPDATE direto e não recalcular evidências antigas.
```

## 5 Identificar o registro e conferir a FK

```bash
python manage.py shell -c 'from contracts.models import ContractSignatures; print(list(ContractSignatures.objects.values_list("pk", flat=True)[:10]))'
# Se a lista estiver vazia, crie um registro pelo fluxo original indicado acima.
# Use um ID ao qual a conta autenticada tenha acesso.
```
```sql
SELECT r.id, r.categoria_autoria_id, c.nome AS categoria_nome
FROM contract_signatures AS r
LEFT JOIN categorias_autoria AS c ON c.id = r.categoria_autoria_id
ORDER BY r.id;
```
```bash
AUTORIA_ID='COLE_O_ID_NOVO_AQUI'
curl --fail-with-body "$AUTORIA_API/autoria/contract_signatures/$AUTORIA_ID" \
  -H "Authorization: Bearer $AUTORIA_TOKEN"
# categoria_id é a escolha copiada do contrato no instante da criação.
```

## 6 Integrar na tela original quando solicitado

Ponto de partida: `FrontEnd/src/pages/contracts/Contrato.tsx`. Renderize fora de outro `<form>` e passe o ID de **ContractSignatures**, não o ID do objeto pai.

```tsx
import { CategoriaEditor } from "@/features/autoria/components/CategoriaEditor";

export function ContractSignaturesCategoria({ id }: { id: string }) {
  return <CategoriaEditor key={id} recurso="contract_signatures" id={id} somenteLeitura />;
}
```

## 7 Conferências

```text
[ ] A FK está em contract_signatures, não apenas no state do React.
[ ] A tabela nova contém exatamente os três registros da migration.
[ ] GET devolve ID e nome, sem campos sensíveis do modelo original.
[ ] PATCH retorna 405; uma criação pelo fluxo real grava a nova FK.
[ ] Recarregar a página mantém o valor gravado.
[ ] Append-only: capturar categoria na NOVA assinatura; manter OTP, hash, encadeamento e triggers.
```
