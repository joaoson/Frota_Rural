# Usuários pelo endpoint e formulário existentes

Alternativa ao endpoint de vínculo do guia [Users](modelos/users.md). Use a tabela de [00](00_tabela_e_tres_registros.md), a listagem de categorias de [01](01_api_services_e_rotas.md) e a FK em `Users`. Este caminho não precisa do `CategoriaEditor`, do `AutoriaStore` ou da página `/autoria`.

```bash
# Terminal em BackEnd/. Se estiver na raiz: cd BackEnd
source .venv/bin/activate
source ../Devops/autoria.env.sh
python manage.py verify_database
# Esperado: 127.0.0.1:5442 / frota_rural.
```

## 1 Serializer de entrada

`BackEnd/users/serializer.py` — acrescentar em `PROFILE_FIELDS`:

```python
    "categoria_autoria",
```

```python
# UserUpdateInputSerializer já utiliza PROFILE_FIELDS.
# ModelSerializer cria automaticamente um PrimaryKeyRelatedField validado.
# Não adicionar role/password/status/employer à lista de campos editáveis.
# PROFILE_FIELDS também é usado pelo cadastro e pelos operadores.
```

## 2 Serializer de saída

`BackEnd/users/serializer.py` — dentro de `UserOutputSerializer`:

```python
    categoria_nome = serializers.CharField(
        source="categoria_autoria.nome", read_only=True, allow_null=True, default=None,
    )
```

Acrescentar em `UserOutputSerializer.Meta.fields`:

```python
    "categoria_autoria",
    "categoria_nome",
```

## 3 Service e view já existentes

```text
PATCH /api/users/<UUID>
  BackEnd/users/urls.py
  BackEnd/users/views/users.py: UserDetailView.patch
  BackEnd/users/services.py: UserService.update
  BackEnd/users/serializer.py: UserUpdateInputSerializer
  serializer.save() -> Users.categoria_autoria_id

GET /api/users/<UUID>
  UserOutputSerializer -> categoria_autoria + categoria_nome

Não criar outro método de update: UserService.update já valida e chama serializer.save().
```

## 4 Schema da resposta

`FrontEnd/src/features/users/types/userSchemas.ts` — dentro de `userApiSchema`:

```typescript
  categoria_autoria: z.string().uuid().nullish(),
  categoria_nome: z.string().nullish(),
```

## 5 Tipo de domínio e mapper

`FrontEnd/src/features/users/types/user.ts` — dentro de `User`:

```typescript
  categoryId?: string | null;
  categoryName?: string | null;
```

`FrontEnd/src/features/users/api/userMapper.ts` — dentro do objeto retornado por `toDomain`:

```typescript
    categoryId: dto.categoria_autoria ?? null,
    categoryName: dto.categoria_nome ?? null,
```

## 6 Payload de atualização

`FrontEnd/src/features/users/api/UserRepository.ts` — dentro de `UpdateProfileInput`:

```typescript
  categoria_autoria?: string;
```

```text
HttpUserRepository.updateProfile já envia input no PATCH.
UserStore.updateProfile já chama o repository.
useUpdateProfile já invalida o cache do usuário e da listagem.
```

## 7 Serviço frontend para as três opções

<!-- file: FrontEnd/src/features/autoria/api/listCategorias.ts -->
```typescript
import { z } from "zod";
import { httpClient } from "@/app/container";

const categoriasSchema = z.array(z.object({ id: z.string().uuid(), nome: z.string() }));

export async function listCategorias() {
  const response = await httpClient.send<unknown>({ method: "GET", path: "autoria/categorias" });
  return categoriasSchema.parse(response.data);
}
```

## 8 Componente para Minha Conta

<!-- file: FrontEnd/src/features/users/components/UserCategoryField.tsx -->
```tsx
import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCategorias } from "@/features/autoria/api/listCategorias";
import { useUpdateProfile } from "../hooks/useUsers";
import type { User } from "../types/user";

export function UserCategoryField({ user }: { user: User }) {
  const inputId = useId();
  const [escolha, setEscolha] = useState<string | null>(null);
  const categorias = useQuery({ queryKey: ["autoria", "categorias"], queryFn: listCategorias });
  const update = useUpdateProfile();
  const value = escolha ?? user.categoryId ?? "";
  if (categorias.isPending) return <p>Carregando categorias...</p>;
  if (categorias.isError) return <p role="alert">{categorias.error.message}</p>;
  return <section className="space-y-3 rounded-lg border p-4">
    <label htmlFor={inputId}>Categoria do perfil</label>
    <select id={inputId} value={value} disabled={update.isPending}
      onChange={(event) => setEscolha(event.target.value)}>
      <option value="">Selecione</option>
      {categorias.data.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
    </select>
    <button type="button" disabled={!value || update.isPending}
      onClick={() => update.mutate({ id: user.id, input: { categoria_autoria: value } })}>
      {update.isPending ? "Salvando..." : "Salvar categoria"}
    </button>
    {update.isError && <p role="alert">{update.error.message}</p>}
    {update.isSuccess && <p role="status">Categoria salva.</p>}
    <p>Categoria persistida: {user.categoryName ?? "Não definida"}</p>
  </section>;
}
```

## 9 Inserir no formulário existente

`FrontEnd/src/features/dashboard/components/AccountSection.tsx` — importar:

```tsx
import { UserCategoryField } from "@/features/users/components/UserCategoryField";
```

No JSX, fora dos formulários de perfil e senha:

```tsx
{user && <UserCategoryField key={user.id} user={user} />}
```

## 10 Validar

```bash
python manage.py makemigrations users
python manage.py migrate
python manage.py check
```

```bash
# Obter AUTORIA_TOKEN pelo login do passo 2 do guia 03_validacao_e_erros.md.
AUTORIA_ID='COLE_O_ID_DO_USUARIO_LOGADO'
curl --fail-with-body -X PATCH "$AUTORIA_API/users/$AUTORIA_ID" \
  -H "Authorization: Bearer $AUTORIA_TOKEN" -H 'Content-Type: application/json' \
  -d '{"categoria_autoria":"33333333-3333-4333-8333-333333333333"}'
curl --fail-with-body "$AUTORIA_API/users/$AUTORIA_ID" \
  -H "Authorization: Bearer $AUTORIA_TOKEN"
```

```text
http://localhost:5183 -> Login -> Minha Conta -> Categoria do perfil -> Prioridade -> Salvar categoria -> F5
GET /api/users/<UUID> deve trazer categoria_nome = Prioridade.

Endpoint original: payload usa categoria_autoria.
Endpoint do tutorial /autoria/users: payload usa categoria_id.
Escolha um dos fluxos; não misture os dois payloads.
```
