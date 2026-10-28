# Denúncias de mensagens · `MessageReports`

Pré-requisitos: [tabela](../00_tabela_e_tres_registros.md), [API comum](../01_api_services_e_rotas.md) e [frontend](../02_frontend_repository_store_componente.md).

| Ponto | Arquivo ou valor |
| --- | --- |
| Modelo existente | `BackEnd/chat/models.py` → `MessageReports` |
| Tabela | `message_reports` |
| Fluxo original | `BackEnd/chat/services.py` |
| Tela original relacionada | `FrontEnd/src/pages/admin/Denuncias.tsx` |
| Componente do exercício | `FrontEnd/src/features/autoria/components/CategoriaEditor.tsx` |
| API nova | `/api/autoria/message_reports/<ID>` |

```python
# Somente admin classifica. Decisão de moderação permanece em ChatModerationService.resolve.
```

## 1 Adicionar a FK

```python
# BackEnd/chat/models.py — dentro de MessageReports, antes de class Meta.
categoria_autoria = models.ForeignKey(
    "autoria.CategoriaAutoria", on_delete=models.PROTECT,
    null=True, blank=True, related_name="+",
)
```

```bash
# Rodar depois de autoria.0002_categorias_iniciais.
docker exec "$AUTORIA_BACKEND" python manage.py makemigrations chat
docker exec "$AUTORIA_BACKEND" python manage.py migrate --plan
docker exec "$AUTORIA_BACKEND" python manage.py migrate
# A migration gerada deve ter AddField e dependência de autoria.
```

## 2 Service do vínculo

<!-- file: BackEnd/chat/autoria_message_reports_services.py -->
```python
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied
from chat.models import MessageReports
from autoria.serializers import VinculoInputSerializer


class MessageReportsCategoriaService:
    @staticmethod
    def _queryset(actor):
        if actor.role == "admin":
            return MessageReports.objects.all()
        raise PermissionDenied("Apenas administradores acessam esta classificação.")

    @staticmethod
    def obter(pk, *, actor):
        return get_object_or_404(
            MessageReportsCategoriaService._queryset(actor).select_related("categoria_autoria"), pk=pk,
        )

    @staticmethod
    @transaction.atomic
    def salvar(pk, data, *, actor):
        registro = get_object_or_404(
            MessageReportsCategoriaService._queryset(actor).select_for_update(of=("self",)), pk=pk,
        )
        serializer = VinculoInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        registro.categoria_autoria = serializer.validated_data["categoria_autoria"]
        registro.save(update_fields=["categoria_autoria"])
        return registro
```

## 3 View e rota

<!-- file: BackEnd/chat/autoria_message_reports_views.py -->
```python
from autoria.views import RegistroCategoriaView
from chat.autoria_message_reports_services import MessageReportsCategoriaService


class MessageReportsCategoriaView(RegistroCategoriaView):
    service = MessageReportsCategoriaService
```

`BackEnd/autoria/urls.py` — acrescentar o import e o `path` na lista existente:

```python
from chat.autoria_message_reports_views import MessageReportsCategoriaView

# Dentro de urlpatterns:
path("autoria/message_reports/<uuid:pk>", MessageReportsCategoriaView.as_view(), name="autoria_message_reports"),
```

## 4 Gravar e exibir no frontend

```text
1. Fazer login com admin@example.test.
2. Abrir http://localhost:5175/autoria/message_reports/ID_REAL.
3. Categoria -> selecionar uma das três opções -> Salvar categoria.
4. Ler novamente do banco -> F5 -> verificar Categoria persistida.
O CategoriaEditor já está conectado ao Repository, Store, GET e PATCH da API.
```

## 5 Identificar o registro e conferir a FK

```bash
docker exec "$AUTORIA_BACKEND" python manage.py shell -c 'from chat.models import MessageReports; print(list(MessageReports.objects.values_list("pk", flat=True)[:10]))'
# Se a lista estiver vazia, crie um registro pelo fluxo original indicado acima.
# Use um ID ao qual a conta autenticada tenha acesso.
```
```sql
SELECT r.id, r.categoria_autoria_id, c.nome AS categoria_nome
FROM message_reports AS r
LEFT JOIN categorias_autoria AS c ON c.id = r.categoria_autoria_id
ORDER BY r.id;
```
```bash
# TOKEN: login do passo 03_validacao_e_erros.md; ID: copiado do banco.
AUTORIA_ID='COLE_O_ID_REAL_AQUI'
curl --fail-with-body -X PATCH "$AUTORIA_API/autoria/message_reports/$AUTORIA_ID" \
  -H "Authorization: Bearer $AUTORIA_TOKEN" -H 'Content-Type: application/json' \
  -d '{"categoria_id":"33333333-3333-4333-8333-333333333333"}'
curl --fail-with-body "$AUTORIA_API/autoria/message_reports/$AUTORIA_ID" \
  -H "Authorization: Bearer $AUTORIA_TOKEN"
# GET deve devolver categoria_nome = Prioridade.
```

## 6 Integrar na tela original quando solicitado

Ponto de partida: `FrontEnd/src/pages/admin/Denuncias.tsx`. Renderize fora de outro `<form>` e passe o ID de **MessageReports**, não o ID do objeto pai.

```tsx
import { CategoriaEditor } from "@/features/autoria/components/CategoriaEditor";

export function MessageReportsCategoria({ id }: { id: string }) {
  return <CategoriaEditor key={id} recurso="message_reports" id={id} />;
}
```

## 7 Conferências

```text
[ ] A FK está em message_reports, não apenas no state do React.
[ ] A tabela nova contém exatamente os três registros da migration.
[ ] GET devolve ID e nome, sem campos sensíveis do modelo original.
[ ] PATCH com categoria inexistente retorna 400; outro usuário sem acesso recebe 403/404.
[ ] Recarregar a página mantém o valor gravado.
[ ] Somente admin classifica. Decisão de moderação permanece em ChatModerationService.resolve.
```
