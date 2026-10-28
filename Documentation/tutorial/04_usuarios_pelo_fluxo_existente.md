# Usuários: continuar seu exercício no fluxo real

Estado de partida: `autoria.Genero`, três registros e `Users.categoria_autoria` já existem e foram migrados. Execute [01](01_api_services_e_rotas.md) e crie os dois arquivos do [02](02_frontend_repository_store_componente.md).

As linhas são referências do código revisado em 28/10/2026. Após inserir código elas mudam; use as duas linhas de contexto indicadas para localizar o ponto.

## 1 Entrada: aceitar o UUID no PATCH de usuário

`BackEnd/users/serializer.py:60` — procurar `class UserUpdateInputSerializer`. Dentro de **UserUpdateInputSerializer.Meta**, entre `model = Users` e `extra_kwargs = UNIQUE_FIELD_KWARGS`, substituir apenas `fields = PROFILE_FIELDS`:

<!-- patch: users-input -->

```python
class Meta:
    model = Users
    fields = [*PROFILE_FIELDS, "categoria_autoria"]
    extra_kwargs = UNIQUE_FIELD_KWARGS
```

O `ModelSerializer` cria o campo de FK validado automaticamente: UUID existente → objeto `Genero`; UUID inexistente → 400; `null` → remover vínculo. Manter `validate()` e os campos protegidos. Não modificar a lista global `PROFILE_FIELDS`, pois ela também atende cadastro e operadores.

## 2 Saída: devolver ID e texto do banco

`BackEnd/users/serializer.py:112` — procurar `class UserOutputSerializer`. Entre a declaração de `profile_photo_url` e `def get_profile_photo_url`, inserir:

<!-- patch: users-output-field -->

```python
categoria_nome = serializers.CharField(
    source="categoria_autoria.Genero", read_only=True, allow_null=True, default=None,
)
```

Na lista `UserOutputSerializer.Meta.fields`, entre `"profile_photo_url",` e `"role",`, inserir:

<!-- patch: users-output-list -->

```python
"categoria_autoria",
"categoria_nome",
```

A saída fica assim, além dos campos que já existiam:

```json
{"categoria_autoria": "11111111-1111-4111-8111-111111111111", "categoria_nome": "Masculino"}
```

## 3 Service: onde a alteração é persistida

`BackEnd/users/services.py:82` — procurar `def update(`. **Manter o método existente**:


```python
user = UserService.get(user_id, actor=actor)
serializer = UserUpdateInputSerializer(user, data=data, partial=partial)
serializer.is_valid(raise_exception=True)
# Aqui validated_data já contém categoria_autoria como objeto Genero.
# O serializer.save() existente grava a FK junto com os campos de perfil.
```

Não adicionar outro `.save()` e não substituir o tratamento de `IntegrityError`.

Para carregar o nome sem uma consulta extra por usuário, em `UserService._visible`, substituir `queryset = Users.objects.all()` por:


```python
queryset = Users.objects.select_related("categoria_autoria")
```

Em `UserService.list`, substituir a expressão do retorno por:


```python
return Users.objects.select_related("categoria_autoria").order_by("name")
```

`BackEnd/users/views/users.py:124` — procurar `def patch(`: já chama `UserService.update(..., partial=True)` e serializa com `UserOutputSerializer`. Não criar rota ou view adicional.

```text
PATCH /api/users/<UUID>
GET   /api/users/<UUID>
```

## 4 Schema Zod: preservar os campos recebidos

`FrontEnd/src/features/users/types/userSchemas.ts:96` — procurar `export const userApiSchema`. Dentro de `userApiSchema`, entre `profile_photo_url: ...` e `role: ...`, inserir:

<!-- patch: users-zod -->

```ts
categoria_autoria: z.string().uuid().nullish(),
categoria_nome: z.string().nullish(),
```

Sem isso, o Zod remove os campos desconhecidos da resposta.

## 5 Tipo de domínio e mapper

`FrontEnd/src/features/users/types/user.ts:1` — procurar `export interface User`. Entre `profilePhotoUrl` e `role`, inserir:

<!-- patch: users-domain -->

```ts
categoriaAutoriaId?: string | null;
categoriaNome?: string | null;
```

`FrontEnd/src/features/users/api/userMapper.ts:6` — procurar `export function toDomain`. No objeto retornado, entre `profilePhotoUrl: ...` e `role: ...`, inserir:

<!-- patch: users-mapper -->

```ts
categoriaAutoriaId: dto.categoria_autoria ?? null,
categoriaNome: dto.categoria_nome ?? null,
```

## 6 Payload do repository existente

`FrontEnd/src/features/users/api/UserRepository.ts:10` — procurar `export interface UpdateProfileInput`. Acrescentar depois de `cep?: string;`, antes do `}` da interface:

<!-- patch: users-payload -->

```ts
categoria_autoria?: string | null;
```

O método `HttpUserRepository.updateProfile` já envia `body: input`; manter. `UserStore.updateProfile` e `useUpdateProfile` já persistem e invalidam as consultas; manter.

## 7 Tela Minha Conta

Arquivo: `FrontEnd/src/features/dashboard/components/AccountSection.tsx`.

**Import**: depois de `ProfilePhotoUpload`, antes do import de `User`:

<!-- patch: users-import -->

```tsx
import { CategoriaSelect } from "@/features/autoria/CategoriaSelect";
```

**Estado**: depois de `const [formCep, setFormCep] = useState("");`, antes de `currentPassword` (referência original: linha 54):

<!-- patch: users-state -->

```tsx
const [formCategoriaId, setFormCategoriaId] = useState("");
```

**Carregar registro**: dentro de `if (user && user.id !== syncedUserId)`, depois de `setFormCep(...)`, antes do `}` (referência original: linha 78):

<!-- patch: users-load -->

```tsx
setFormCategoriaId(user.categoriaAutoriaId ?? "");
```

**Salvar**: dentro de `updateProfile.mutateAsync({ id: userId, input: { ... } })`, depois de `cep: clearSpecialChars(formCep),`, antes de fechar `input` (referência original: linha 141):

<!-- patch: users-send -->

```tsx
categoria_autoria: formCategoriaId || null,
```

**Seletor e leitura**: logo após abrir `<fieldset disabled={!user || updateProfile.isPending} ...>`, antes do `FormField` de Nome Completo (referência original: linha 206):

<!-- patch: users-render -->

```tsx
<CategoriaSelect
  label="Gênero"
  value={formCategoriaId}
  onChange={setFormCategoriaId}
/>
<p className="text-sm text-on-surface-variant">
  Salvo no banco: {user?.categoriaNome ?? "Não informado"}
</p>
```

O seletor mostra o rascunho; o parágrafo mostra `user` recebido da API. O botão **Salvar** já existente envia o formulário todo.

## 8 Conferir


```bash
# Terminal em BackEnd/
source .venv/bin/activate
source ../Devops/autoria.env.sh
python manage.py verify_database
# Esperado: 127.0.0.1:5442 / frota_rural_autoria
python manage.py check
python manage.py makemigrations --check --dry-run
```

```bash
# Outro terminal, na raiz:
cd FrontEnd
npx tsc -b
npm run lint
```

Abrir `http://localhost:5183`, entrar com uma conta do seed, abrir Minha Conta, escolher gênero, salvar e pressionar F5. O mesmo gênero deve aparecer no seletor e em “Salvo no banco”.

```sql
SELECT u.email, u.categoria_autoria_id, g."Genero"
FROM users u
LEFT JOIN "Genero" g ON g.id = u.categoria_autoria_id
WHERE u.email = 'joao.silva@example.test';
```

Não executar o seed novamente para validar: ele não substitui a gravação pelo formulário. Para testes de API e IDs inválidos, seguir o [guia 03](03_validacao_e_erros.md).

## 9 Ajustar os testes de tela existentes ao novo catálogo

`FrontEnd/src/test/container.ts`: trocar `const httpClient = fakeHttp();` por `export const httpClient = fakeHttp();`. O hook do catálogo importa esse mesmo nome.

Em `accountSectionFlows.test.tsx`, no helper `api`, acrescentar a rota:

```ts
"GET autoria/categorias": () => [
  { id: "11111111-1111-4111-8111-111111111111", nome: "Masculino" },
],
```

O teste que compara o payload completo de perfil precisa incluir `categoria_autoria: null` quando não houver seleção. Asserções de “nenhuma chamada” devem verificar ausência de PATCH de perfil, pois a abertura agora faz GET do catálogo:

```ts
expect(net.http.send.mock.calls.filter(([request]) => request.method === "PATCH")).toHaveLength(0);
```

Em `accountSettings.test.tsx`, que monta a conta sem QueryClientProvider e isola seus hooks, adicionar o mock do novo hook:

```ts
vi.mock("@/features/autoria/useCategorias", () => ({
  useCategorias: () => ({ data: [], isPending: false, isError: false }),
}));
```

Os testes específicos de gênero devem usar o hook/repository reais com rede simulada e verificar a sequência seleção → PATCH → GET → remontagem. Não verificar apenas o valor local do select.
