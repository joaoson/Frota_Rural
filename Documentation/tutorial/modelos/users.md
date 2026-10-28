# Usuários — `Users` (Cadastro e Minha Conta)

> **Pedido de exemplo:** "No cadastro de usuário, adicione o porte da propriedade (Pequena, Média, Grande). O usuário pode alterar em Minha Conta, e o porte aparece no perfil."

**Telas:** cadastro público (`/signup` → `pages/auth/Signup.tsx`); edição e exibição em Minha Conta (`features/dashboard/components/AccountSection.tsx`, usado pelos dois painéis).

**Testado numa cópia limpa:**
- O cadastro com "Grande" grava `users.porte_propriedade_id`.
- Minha Conta mostra "Porte: Grande".
- Depois de trocar para "Pequena", salvar e apertar F5, aparece "Porte: Pequena".

O raciocínio de cada passo está no [exemplo de máquina](../02_exemplo_maquina_tipo_pneu.md). As linhas são do arquivo **original** (commit `0ca8c7e`).

> Para operadores (também `Users`), veja o [guia de operadores](operators.md).

## Mapa

| # | Arquivo | O que |
| --- | --- | --- |
| 1 | `BackEnd/users/models.py` | `PortePropriedade` + FK `porte_propriedade` |
| 2 | `BackEnd/users/migrations/` | schema + 3 registros |
| 3 | `BackEnd/users/serializer.py` | cadastro, perfil, saída, catálogo |
| 4 | `BackEnd/users/services.py` | `PortePropriedadeService` |
| 5 | `BackEnd/users/views/users.py`, `views/__init__.py`, `urls.py` | `GET /api/users/portes-propriedade` (**público**) |
| 6 | `features/users/types/user.ts`, `userSchemas.ts` | tipos e Zod |
| 7 | `features/users/api/userMapper.ts` | ler e enviar |
| 8 | `UserRepository.ts`, `UserStore.ts`, hook novo | buscar o catálogo |
| 9 | `features/users/hooks/useSignupForm.ts` + `pages/auth/Signup.tsx` | select no cadastro |
| 10 | `features/dashboard/components/AccountSection.tsx` | select + exibição em Minha Conta |

## Backend

### 1. Model — `BackEnd/users/models.py`

`import uuid` já existe na linha 1. Antes da linha 27 (`class Users(AbstractBaseUser):`), colar:

```python
class PortePropriedade(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=60, unique=True)

    class Meta:
        db_table = "portes_propriedade"
        ordering = ["nome"]

    def __str__(self) -> str:
        return self.nome


```

Depois da linha 57 (`updated_at = models.DateTimeField(auto_now=True)`), antes de `USERNAME_FIELD`, colar:

```python
    porte_propriedade = models.ForeignKey(PortePropriedade, models.PROTECT, blank=True, null=True)
```

### 2. Migrations

```bash
python manage.py makemigrations users
# 0007_portepropriedade_users_porte_propriedade.py
python manage.py makemigrations users --empty --name portes_propriedade_iniciais
# 0008_portes_propriedade_iniciais.py
```

Conteúdo inteiro da migration de dados. Em `dependencies`, use o nome gerado no primeiro comando:

```python
from django.db import migrations

PORTES = [
    ("4c9f6e30-0000-4000-8000-000000000001", "Pequena"),
    ("4c9f6e30-0000-4000-8000-000000000002", "Média"),
    ("4c9f6e30-0000-4000-8000-000000000003", "Grande"),
]


def inserir_portes(apps, schema_editor):
    PortePropriedade = apps.get_model("users", "PortePropriedade")
    for id_, nome in PORTES:
        PortePropriedade.objects.update_or_create(id=id_, defaults={"nome": nome})


def remover_portes(apps, schema_editor):
    PortePropriedade = apps.get_model("users", "PortePropriedade")
    PortePropriedade.objects.filter(id__in=[id_ for id_, _ in PORTES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0007_portepropriedade_users_porte_propriedade"),
    ]

    operations = [
        migrations.RunPython(inserir_portes, remover_portes),
    ]
```

### 3. Serializers — `BackEnd/users/serializer.py`

`PROFILE_FIELDS` (linha 25) é compartilhado com o cadastro de operadores. Por isso o campo entra **nos dois serializers** de cadastro e perfil, e não na lista comum.

| Linha original | Ação |
| --- | --- |
| 8 | Trocar por `from users.models import PortePropriedade, Users` |
| 56 (`UserCreateInputSerializer`) | Trocar por `fields = [*PROFILE_FIELDS, "porte_propriedade", "role", "password"]` |
| 77 (`UserUpdateInputSerializer`) | Trocar por `fields = [*PROFILE_FIELDS, "porte_propriedade"]` |
| depois da 113 (`profile_photo_url = serializers.SerializerMethodField()`, em `UserOutputSerializer`) | `    porte_propriedade_nome = serializers.CharField(source="porte_propriedade.nome", read_only=True, allow_null=True)` |
| depois da 137 (`"updated_at",` em `UserOutputSerializer.Meta.fields`) | `"porte_propriedade",` e `"porte_propriedade_nome",` |
| fim (depois da 148) | serializer do catálogo |

```python


class PortePropriedadeOutputSerializer(serializers.ModelSerializer[PortePropriedade]):
    class Meta:
        model = PortePropriedade
        fields = ["id", "nome"]
        read_only_fields = fields
```

**Gravação, sem mexer no service:**
- **Cadastro:** `UserService.create` → `_create_account(serializer.validated_data)` (`users/services.py:37`) faz `Users(**fields)`, e o objeto `PortePropriedade` validado entra direto.
- **Perfil:** `UserService.update` (`users/services.py:82`) → `serializer.save()`.

### 4. Service — `BackEnd/users/services.py`

Linha 16, trocar por `from users.models import PortePropriedade, Users`. No fim (depois da linha 227):

```python


class PortePropriedadeService:
    @staticmethod
    def list() -> QuerySet[PortePropriedade]:
        return PortePropriedade.objects.order_by("nome")
```

### 5. View e rota

`BackEnd/users/views/users.py`:

- Linha 8, trocar por `from rest_framework.permissions import AllowAny, IsAuthenticated`.
- Depois da linha 14 (`ChangePasswordInputSerializer,`), colar `    PortePropriedadeOutputSerializer,`.
- Linha 19, trocar por `from users.services import PortePropriedadeService, UserService`.
- No fim (depois da linha 169), colar:

```python


class PortePropriedadeListView(APIView):
    # Público: o cadastro (Signup) ainda não tem login.
    permission_classes = [AllowAny]

    @extend_schema(
        tags=TAGS,
        summary="Listar portes de propriedade",
        description="Opções da tabela `portes_propriedade` usadas no cadastro e em Minha Conta.",
        responses={200: PortePropriedadeOutputSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        portes = PortePropriedadeService.list()
        return Response(PortePropriedadeOutputSerializer(portes, many=True).data, status=status.HTTP_200_OK)
```

`BackEnd/users/views/__init__.py`:
- Depois da linha 3 (`from users.views.users import (`), colar `    PortePropriedadeListView,`.
- Depois da linha 13 (`"OperatorListView",`), colar `    "PortePropriedadeListView",`.

`BackEnd/users/urls.py`:
- Depois da linha 5 (`OperatorListView,`), colar `    PortePropriedadeListView,`.
- Depois da linha 21 (`path("users/operators/<uuid:pk>", ...)`), colar:

```python
    path("users/portes-propriedade", PortePropriedadeListView.as_view(), name="portes_propriedade"),
```

## Frontend (`FrontEnd/src/`)

### 6. Tipos e Zod

`features/users/types/user.ts`:
- Depois da linha 16 (`createdAt: Date | null;`), colar `portePropriedadeId: string | null;` e `portePropriedadeNome: string | null;`.
- Depois da linha 17 (o `}`), colar:

```ts

export interface PortePropriedade {
  id: string;
  nome: string;
}
```

`features/users/types/userSchemas.ts`:

| Linha original | Colar |
| --- | --- |
| depois da 91 (`state: z.string().min(1, "Selecione o estado."),` em `signupFormSchema`) | `portePropriedade: z.string(),` |
| depois da 112 (`updated_at: z.string().nullish(),` em `userApiSchema`) | `porte_propriedade: z.string().nullish(),` e `porte_propriedade_nome: z.string().nullish(),` |
| depois da 115 (`export const userListApiSchema = ...`) | bloco abaixo |

```ts

export const portePropriedadeListApiSchema = z.array(
  z.object({ id: z.string(), nome: z.string() }),
);
```

### 7. Mapper — `features/users/api/userMapper.ts`

| Linha original | Colar |
| --- | --- |
| depois da 21 (`createdAt: ...`, em `toDomain`) | `portePropriedadeId: dto.porte_propriedade ?? null,` e `portePropriedadeNome: dto.porte_propriedade_nome ?? null,` |
| depois da 37 (`password: string;`, em `CreateUserPayload`) | `porte_propriedade?: string \| null;` |
| depois da 52 (`password: values.password,`, em `toCreatePayload`) | `porte_propriedade: values.portePropriedade \|\| null,` |

### 8. Repository, Store e hook

`features/users/api/UserRepository.ts`:

| Linha original | Ação |
| --- | --- |
| 3–4 | Trocar por `import type { PortePropriedade, User } from "../types/user";` e `import { portePropriedadeListApiSchema, userApiSchema, userListApiSchema } from "../types/userSchemas";` |
| depois da 18 (`cep?: string;`, em `UpdateProfileInput`) | `porte_propriedade?: string \| null;` |
| depois da 27 (`changePassword(...): Promise<void>;`) | `listPortesPropriedade(): Promise<PortePropriedade[]>;` |
| depois da 84 (o `}` que fecha `changePassword`) | método abaixo |

```ts

  async listPortesPropriedade(): Promise<PortePropriedade[]> {
    const response = await this.http.send<unknown>({ method: "GET", path: "users/portes-propriedade" });
    return portePropriedadeListApiSchema.parse(response.data);
  }
```

`features/users/api/UserStore.ts`:
- Linha 3, trocar por `import type { PortePropriedade, User } from "../types/user";`.
- Depois da linha 10 (`detail: ...`), colar `  portesPropriedade: () => [...userKeys.all, "portes-propriedade"] as const,`.
- Depois da linha 30 (o `}` que fecha `detailOptions`), colar:

```ts

  portesPropriedadeOptions(): UseQueryOptions<PortePropriedade[], Error, PortePropriedade[], ReturnType<typeof userKeys.portesPropriedade>> {
    return { queryKey: userKeys.portesPropriedade(), queryFn: () => this.repository.listPortesPropriedade() };
  }
```

**Arquivo novo:** `features/users/hooks/usePortesPropriedade.ts`

```ts
import { useQuery } from "@tanstack/react-query";

import { userStore } from "@/app/container";

export function usePortesPropriedade() {
  return useQuery(userStore.portesPropriedadeOptions());
}
```

### 9. Cadastro (Signup)

`features/users/hooks/useSignupForm.ts`: depois da linha 16 (`state: "",`), colar `portePropriedade: "",`.

`pages/auth/Signup.tsx`:

| Linha original | Colar |
| --- | --- |
| depois da 6 (`import { useCreateUser } ...`) | `import { usePortesPropriedade } from "@/features/users/hooks/usePortesPropriedade";` |
| depois da 33 (`state: "state",`, em `API_FIELD_TO_FORM`) | `porte_propriedade: "portePropriedade",` |
| depois da 48 (`const createUser = useCreateUser();`) | `const portes = usePortesPropriedade();` |
| depois da 214 (o `</div>` que fecha a grade Cidade/Estado), antes de `<PasswordField` | select abaixo |

```tsx

            <FormField label="Porte da Propriedade" error={errors.portePropriedade?.message}>
              <select
                className={inputClass(Boolean(errors.portePropriedade))}
                disabled={portes.isLoading}
                {...form.register("portePropriedade")}
              >
                <option value="">Selecione o porte da propriedade</option>
                {(portes.data ?? []).map((porte) => (
                  <option key={porte.id} value={porte.id}>{porte.nome}</option>
                ))}
              </select>
            </FormField>
```

O submit (linha 69) já faz `createUser.mutateAsync(toCreatePayload(values))`.

### 10. Minha Conta — `features/dashboard/components/AccountSection.tsx`

Esta tela usa um `useState` por campo, e não react-hook-form.

| Linha original | Colar |
| --- | --- |
| depois da 4 (`import { useChangePassword, useUpdateProfile } ...`) | `import { usePortesPropriedade } from "@/features/users/hooks/usePortesPropriedade";` |
| depois da 45 (`const { lookup } = useCepLookup();`) | `const portes = usePortesPropriedade();` |
| depois da 54 (`const [formCep, setFormCep] = useState("");`) | `const [formPorte, setFormPorte] = useState("");` |
| depois da 78 (`setFormCep(maskCEP(user.cep ?? ""));`) | `setFormPorte(user.portePropriedadeId ?? "");` (carrega o valor salvo) |
| depois da 141 (`cep: clearSpecialChars(formCep),`) | `porte_propriedade: formPorte \|\| null,` (envia no PATCH) |
| depois da 201 (`<div ...>{roleLabel}</div>`) | exibição, abaixo |
| depois da 300 (o `</div>` que fecha Cidade/Estado), antes de `</fieldset>` | select, abaixo |

```tsx
              <div className="text-sm text-on-surface-variant mb-2">Porte: {user?.portePropriedadeNome ?? "Não informado"}</div>
```

```tsx

            <FormField label="Porte da Propriedade" labelClassName={ACCOUNT_LABEL}>
              <select
                value={formPorte}
                onChange={(event) => setFormPorte(event.target.value)}
                className={ACCOUNT_INPUT}
              >
                <option value="">Não informado</option>
                {(portes.data ?? []).map((porte) => (
                  <option key={porte.id} value={porte.id}>{porte.nome}</option>
                ))}
              </select>
            </FormField>
```

## Testes que quebram

Sem os ajustes, o `tsc` acusa 2 erros e 14 testes falham em 5 arquivos. A linha de mock usada abaixo é sempre esta:

```tsx
vi.mock("@/features/users/hooks/usePortesPropriedade", () => ({ usePortesPropriedade: () => ({ data: [], isLoading: false }) }));
```

| Arquivo | Ajuste |
| --- | --- |
| `features/dashboard/tests/accountSettings.test.tsx` | Mock antes da linha 10. Na linha 18 (`const user: User = {...}`), acrescentar `portePropriedadeId: null, portePropriedadeNome: null` |
| `features/dashboard/tests/accountSectionFlows.test.tsx` | Mock antes da linha 11. Linha 39 (body esperado do PATCH): acrescentar `porte_propriedade: null,` |
| `features/users/tests/profilePhotos.test.tsx` | Mock antes da linha 19 |
| `pages/auth/tests/Signup.test.tsx` | Mock antes da linha 12 |
| `features/users/tests/userData.test.tsx` | Linha 17 (`const signup`): `portePropriedade: ""`. Linha 24 (payload esperado): `porte_propriedade: null,` |

Com os ajustes: 148 testes passam (users, dashboard, auth).

## Demonstrar

```sql
SELECT id, nome FROM portes_propriedade;

SELECT u.email, u.porte_propriedade_id, p.nome
FROM users u LEFT JOIN portes_propriedade p ON p.id = u.porte_propriedade_id
ORDER BY u.created_at DESC LIMIT 3;
```

Para demonstrar:

1. Cadastre uma conta em `/signup` com "Grande" e mostre a linha no banco.
2. Entre na conta e abra Minha Conta: aparece "Porte: Grande".
3. Troque para "Pequena", clique em "Salvar Alterações" e aperte F5: agora aparece "Porte: Pequena", e o select vem preenchido.
