# Mensagens · `Messages`

Pré-requisitos: [tabela](../00_tabela_e_tres_registros.md), [API comum](../01_api_services_e_rotas.md) e [frontend](../02_frontend_repository_store_componente.md).

```bash
# Terminal em BackEnd/. Se estiver na raiz: cd BackEnd
source .venv/bin/activate
source ../Devops/autoria.env.sh
python manage.py verify_database
# Esperado: 127.0.0.1:5442 / frota_rural_autoria.
```

| Ponto | Arquivo ou valor |
| --- | --- |
| Modelo existente | `BackEnd/chat/models.py` → `Messages` |
| Tabela | `messages` |
| Fluxo original | `BackEnd/chat/services.py` |
| Tela original relacionada | `FrontEnd/src/pages/messages/Mensagens.tsx` |
| Componente do exercício | `FrontEnd/src/features/autoria/components/CategoriaEditor.tsx` |
| API nova | `/api/autoria/messages/<ID>` |

```python
# Somente remetente ou admin classifica; não alterar conteúdo, leitura, destinatário ou escopo.
```

## 1 Adicionar a FK

```python
# BackEnd/chat/models.py — dentro de Messages, antes de class Meta.
categoria_autoria = models.ForeignKey(
    "autoria.CategoriaAutoria", on_delete=models.PROTECT,
    null=True, blank=True, related_name="+",
)
```

```bash
# Rodar depois de autoria.0002_categorias_iniciais.
python manage.py makemigrations chat
python manage.py migrate --plan
python manage.py migrate
# A migration gerada deve ter AddField e dependência de autoria.
```

## 2 Service do vínculo

<!-- file: BackEnd/chat/autoria_messages_services.py -->
```python
from django.db import transaction
from django.shortcuts import get_object_or_404
from chat.models import Messages
from autoria.serializers import VinculoInputSerializer


class MessagesCategoriaService:
    @staticmethod
    def _queryset(actor):
        if actor.role == "admin":
            return Messages.objects.all()
        return Messages.objects.filter(sender=actor)

    @staticmethod
    def obter(pk, *, actor):
        return get_object_or_404(
            MessagesCategoriaService._queryset(actor).select_related("categoria_autoria"), pk=pk,
        )

    @staticmethod
    @transaction.atomic
    def salvar(pk, data, *, actor):
        registro = get_object_or_404(
            MessagesCategoriaService._queryset(actor).select_for_update(of=("self",)), pk=pk,
        )
        serializer = VinculoInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        registro.categoria_autoria = serializer.validated_data["categoria_autoria"]
        registro.save(update_fields=["categoria_autoria"])
        return registro
```

## 3 View e rota

<!-- file: BackEnd/chat/autoria_messages_views.py -->
```python
from autoria.views import RegistroCategoriaView
from chat.autoria_messages_services import MessagesCategoriaService


class MessagesCategoriaView(RegistroCategoriaView):
    service = MessagesCategoriaService
```

`BackEnd/autoria/urls.py` — acrescentar o import e o `path` na lista existente:

```python
from chat.autoria_messages_views import MessagesCategoriaView

# Dentro de urlpatterns:
path("autoria/messages/<uuid:pk>", MessagesCategoriaView.as_view(), name="autoria_messages"),
```

## 4 Gravar e exibir no frontend

```text
1. Fazer login como dono do registro (ou administrador).
2. Abrir http://localhost:5183/autoria/messages/ID_REAL.
3. Categoria -> selecionar uma das três opções -> Salvar categoria.
4. Ler novamente do banco -> F5 -> verificar Categoria persistida.
O CategoriaEditor já está conectado ao Repository, Store, GET e PATCH da API.
```

## 5 Identificar o registro e conferir a FK

```bash
python manage.py shell -c 'from chat.models import Messages; print(list(Messages.objects.values_list("pk", flat=True)[:10]))'
# Se a lista estiver vazia, crie um registro pelo fluxo original indicado acima.
# Use um ID ao qual a conta autenticada tenha acesso.
```
```sql
SELECT r.id, r.categoria_autoria_id, c.nome AS categoria_nome
FROM messages AS r
LEFT JOIN categorias_autoria AS c ON c.id = r.categoria_autoria_id
ORDER BY r.id;
```
```bash
# TOKEN: login do passo 03_validacao_e_erros.md; ID: copiado do banco.
AUTORIA_ID='COLE_O_ID_REAL_AQUI'
curl --fail-with-body -X PATCH "$AUTORIA_API/autoria/messages/$AUTORIA_ID" \
  -H "Authorization: Bearer $AUTORIA_TOKEN" -H 'Content-Type: application/json' \
  -d '{"categoria_id":"33333333-3333-4333-8333-333333333333"}'
curl --fail-with-body "$AUTORIA_API/autoria/messages/$AUTORIA_ID" \
  -H "Authorization: Bearer $AUTORIA_TOKEN"
# GET deve devolver categoria_nome = Prioridade.
```

## 6 Integrar na tela original quando solicitado

Ponto de partida: `FrontEnd/src/pages/messages/Mensagens.tsx`. Renderize fora de outro `<form>` e passe o ID de **Messages**, não o ID do objeto pai.

```tsx
import { CategoriaEditor } from "@/features/autoria/components/CategoriaEditor";

export function MessagesCategoria({ id }: { id: string }) {
  return <CategoriaEditor key={id} recurso="messages" id={id} />;
}
```

## 7 Conferências

```text
[ ] A FK está em messages, não apenas no state do React.
[ ] A tabela nova contém exatamente os três registros da migration.
[ ] GET devolve ID e nome, sem campos sensíveis do modelo original.
[ ] PATCH com categoria inexistente retorna 400; outro usuário sem acesso recebe 403/404.
[ ] Recarregar a página mantém o valor gravado.
[ ] Somente remetente ou admin classifica; não alterar conteúdo, leitura, destinatário ou escopo.
```
