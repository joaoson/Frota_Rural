# Usuários · `Users`

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
| Modelo existente | `BackEnd/users/models.py` → `Users` |
| Tabela | `users` |
| Fluxo original | `BackEnd/users/services.py` |
| Tela original relacionada | `FrontEnd/src/features/dashboard/components/AccountSection.tsx` |
| Componente do exercício | `FrontEnd/src/features/autoria/components/CategoriaEditor.tsx` |
| API nova | `/api/autoria/users/<ID>` |

```python
# Categoria é metadado; não substitui role, status, employer nem altera senha.
```

## 1 Adicionar a FK

```python
# BackEnd/users/models.py — dentro de Users, antes de class Meta.
categoria_autoria = models.ForeignKey(
    "autoria.CategoriaAutoria", on_delete=models.PROTECT,
    null=True, blank=True, related_name="+",
)
```

```bash
# Rodar depois de autoria.0002_categorias_iniciais.
python manage.py makemigrations users
python manage.py migrate --plan
python manage.py migrate
# A migration gerada deve ter AddField e dependência de autoria.
```

## 2 Service do vínculo

<!-- file: BackEnd/users/autoria_users_services.py -->
```python
from django.db import transaction
from django.shortcuts import get_object_or_404
from users.models import Users
from autoria.serializers import VinculoInputSerializer


class UsersCategoriaService:
    @staticmethod
    def _queryset(actor):
        if actor.role == "admin":
            return Users.objects.all()
        return Users.objects.filter(pk=actor.pk)

    @staticmethod
    def obter(pk, *, actor):
        return get_object_or_404(
            UsersCategoriaService._queryset(actor).select_related("categoria_autoria"), pk=pk,
        )

    @staticmethod
    @transaction.atomic
    def salvar(pk, data, *, actor):
        registro = get_object_or_404(
            UsersCategoriaService._queryset(actor).select_for_update(of=("self",)), pk=pk,
        )
        serializer = VinculoInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        registro.categoria_autoria = serializer.validated_data["categoria_autoria"]
        registro.save(update_fields=["categoria_autoria"])
        return registro
```

## 3 View e rota

<!-- file: BackEnd/users/autoria_users_views.py -->
```python
from autoria.views import RegistroCategoriaView
from users.autoria_users_services import UsersCategoriaService


class UsersCategoriaView(RegistroCategoriaView):
    service = UsersCategoriaService
```

`BackEnd/autoria/urls.py` — acrescentar o import e o `path` na lista existente:

```python
from users.autoria_users_views import UsersCategoriaView

# Dentro de urlpatterns:
path("autoria/users/<uuid:pk>", UsersCategoriaView.as_view(), name="autoria_users"),
```

## 4 Gravar e exibir no frontend

```text
1. Fazer login como dono do registro (ou administrador).
2. Abrir http://localhost:5183/autoria/users/ID_REAL.
3. Categoria -> selecionar uma das três opções -> Salvar categoria.
4. Ler novamente do banco -> F5 -> verificar Categoria persistida.
O CategoriaEditor já está conectado ao Repository, Store, GET e PATCH da API.
```

## 5 Identificar o registro e conferir a FK

```bash
python manage.py shell -c 'from users.models import Users; print(list(Users.objects.values_list("pk", flat=True)[:10]))'
# Se a lista estiver vazia, crie um registro pelo fluxo original indicado acima.
# Use um ID ao qual a conta autenticada tenha acesso.
```
```sql
SELECT r.id, r.categoria_autoria_id, c.nome AS categoria_nome
FROM users AS r
LEFT JOIN categorias_autoria AS c ON c.id = r.categoria_autoria_id
ORDER BY r.id;
```
```bash
# TOKEN: login do passo 03_validacao_e_erros.md; ID: copiado do banco.
AUTORIA_ID='COLE_O_ID_REAL_AQUI'
curl --fail-with-body -X PATCH "$AUTORIA_API/autoria/users/$AUTORIA_ID" \
  -H "Authorization: Bearer $AUTORIA_TOKEN" -H 'Content-Type: application/json' \
  -d '{"categoria_id":"33333333-3333-4333-8333-333333333333"}'
curl --fail-with-body "$AUTORIA_API/autoria/users/$AUTORIA_ID" \
  -H "Authorization: Bearer $AUTORIA_TOKEN"
# GET deve devolver categoria_nome = Prioridade.
```

## 6 Integrar na tela original quando solicitado

Ponto de partida: `FrontEnd/src/features/dashboard/components/AccountSection.tsx`. Renderize fora de outro `<form>` e passe o ID de **Users**, não o ID do objeto pai.

```tsx
import { CategoriaEditor } from "@/features/autoria/components/CategoriaEditor";

export function UsersCategoria({ id }: { id: string }) {
  return <CategoriaEditor key={id} recurso="users" id={id} />;
}
```

No JSX de `AccountSection.tsx`, `userId` já existe:

```tsx
{userId && <UsersCategoria id={userId} />}
```

## 7 Conferências

```text
[ ] A FK está em users, não apenas no state do React.
[ ] A tabela nova contém exatamente os três registros da migration.
[ ] GET devolve ID e nome, sem campos sensíveis do modelo original.
[ ] PATCH com categoria inexistente retorna 400; outro usuário sem acesso recebe 403/404.
[ ] Recarregar a página mantém o valor gravado.
[ ] Categoria é metadado; não substitui role, status, employer nem altera senha.
```
