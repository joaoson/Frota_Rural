# Operadores — `Users` com papel `operador`

> **Pedido de exemplo:** "No cadastro de operador, adicione a função (Tratorista, Operador de colheitadeira, Operador de pulverizador) e mostre a função no card do operador."

**Tela:** aba **Operadores** do painel do locador (`/dashboard?tab=operadores` → `components/OperadoresPanel.tsx`). Cadastro, edição e listagem ficam no mesmo componente.

**Testado numa cópia limpa:** cadastrar com "Tratorista" → F5 mostra "Função: Tratorista" → Editar já vem com "Tratorista" → trocar e salvar → F5 mostra "Função: Operador de colheitadeira".

Operadores **não têm model próprio**: são linhas de `users` com `role = "operador"` e `employer_id` apontando para quem cadastrou. A FK nova entra em `Users`, mas só os serializers de operador a aceitam.

As linhas são do arquivo **original** (commit `0ca8c7e`). Se você também fez o [guia de usuários](users.md), os números de `users/models.py` e `serializer.py` andam: use as âncoras.

## Backend

### 1. Model — `BackEnd/users/models.py`

Antes da linha 27 (`class Users(AbstractBaseUser):`), colar:

```python
class FuncaoOperador(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=60, unique=True)

    class Meta:
        db_table = "funcoes_operador"
        ordering = ["nome"]

    def __str__(self) -> str:
        return self.nome


```

Depois da linha 57 (`updated_at = models.DateTimeField(auto_now=True)`):

```python
    funcao_operador = models.ForeignKey(FuncaoOperador, models.PROTECT, blank=True, null=True)
```

### 2. Migrations

```bash
python manage.py makemigrations users
python manage.py makemigrations users --empty --name funcoes_operador_iniciais
```

Migration de dados. Em `dependencies`, use o nome gerado pelo primeiro comando, por exemplo `0007_funcaooperador_users_funcao_operador`:

```python
from django.db import migrations

FUNCOES = [
    ("5d0a7f40-0000-4000-8000-000000000001", "Tratorista"),
    ("5d0a7f40-0000-4000-8000-000000000002", "Operador de colheitadeira"),
    ("5d0a7f40-0000-4000-8000-000000000003", "Operador de pulverizador"),
]


def inserir_funcoes(apps, schema_editor):
    FuncaoOperador = apps.get_model("users", "FuncaoOperador")
    for id_, nome in FUNCOES:
        FuncaoOperador.objects.update_or_create(id=id_, defaults={"nome": nome})


def remover_funcoes(apps, schema_editor):
    FuncaoOperador = apps.get_model("users", "FuncaoOperador")
    FuncaoOperador.objects.filter(id__in=[id_ for id_, _ in FUNCOES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0007_funcaooperador_users_funcao_operador"),
    ]

    operations = [
        migrations.RunPython(inserir_funcoes, remover_funcoes),
    ]
```

### 3. Serializers — `BackEnd/users/serializer.py`

| Linha original | Ação |
| --- | --- |
| 8 | Trocar por `from users.models import FuncaoOperador, Users` |
| 98 (`OperatorCreateInputSerializer`) | Trocar por `fields = [*PROFILE_FIELDS, "funcao_operador", "password"]` |
| 105 (`OperatorUpdateInputSerializer`) | Trocar por `fields = [*PROFILE_FIELDS, "funcao_operador"]` |
| depois da 143 (docstring de `OperatorOutputSerializer`) | linha em branco + `    funcao_operador_nome = serializers.CharField(source="funcao_operador.nome", read_only=True, allow_null=True)` |
| 147 (`fields = ["id", *PROFILE_FIELDS, ...]`) | Acrescentar `"funcao_operador", "funcao_operador_nome"` ao fim da lista |
| fim (depois da 148) | serializer do catálogo |

```python


class FuncaoOperadorOutputSerializer(serializers.ModelSerializer[FuncaoOperador]):
    class Meta:
        model = FuncaoOperador
        fields = ["id", "nome"]
        read_only_fields = fields
```

**Gravação, sem mexer no service:**
- **Cadastro:** `OperatorService.create` (`users/services.py:194`) usa `_create_account(serializer.validated_data, ...)`.
- **Edição:** `OperatorService.update` (`users/services.py:208`) usa `serializer.save()`.

### 4. Service — `BackEnd/users/services.py`

Linha 16, trocar por `from users.models import FuncaoOperador, Users`. No fim (depois da linha 227):

```python


class FuncaoOperadorService:
    @staticmethod
    def list() -> QuerySet[FuncaoOperador]:
        return FuncaoOperador.objects.order_by("nome")
```

### 5. View e rota

`BackEnd/users/views/operators.py`:
- Depois da linha 13 (`from users.serializer import (`), colar `    FuncaoOperadorOutputSerializer,`.
- Linha 18, trocar por `from users.services import FuncaoOperadorService, OperatorService`.
- No fim (depois da linha 97), colar:

```python


class FuncaoOperadorListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Listar funções de operador",
        description="Opções da tabela `funcoes_operador` usadas no cadastro de operadores.",
        responses={200: FuncaoOperadorOutputSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        funcoes = FuncaoOperadorService.list()
        return Response(FuncaoOperadorOutputSerializer(funcoes, many=True).data, status=status.HTTP_200_OK)
```

`BackEnd/users/views/__init__.py`:
- Linha 1, trocar por `from users.views.operators import FuncaoOperadorListView, OperatorDetailView, OperatorListView`.
- Depois da linha 11 (`__all__ = [`), colar `    "FuncaoOperadorListView",`.

`BackEnd/users/urls.py`:
- Depois da linha 3 (`from users.views import (`), colar `    FuncaoOperadorListView,`.
- Depois da linha 20 (`path("users/operators", ...)`), colar:

```python
    path("users/operators/funcoes", FuncaoOperadorListView.as_view(), name="operator_funcoes"),
```

Não há conflito com `users/operators/<uuid:pk>`, porque `funcoes` não é um UUID.

## Frontend (`FrontEnd/src/`)

### 6. Tipos, Zod e mapper

`features/operators/types/operator.ts`:
- Depois da linha 13 (`status: string | null;`), colar `funcaoOperadorId: string | null;` e `funcaoOperadorNome: string | null;`.
- Depois da linha 14 (o `}`), colar:

```ts

export interface FuncaoOperador {
  id: string;
  nome: string;
}
```

`features/operators/types/operatorSchemas.ts`:
- Depois da linha 19 (`updated_at: z.string().nullish(),`), colar `funcao_operador: z.string().nullish(),` e `funcao_operador_nome: z.string().nullish(),`.
- Depois da linha 21 (`export const operatorListApiSchema = ...`), colar:

```ts
export const funcaoOperadorListApiSchema = z.array(
  z.object({ id: z.string(), nome: z.string() }),
);
```

`features/operators/api/operatorMapper.ts`:
- Depois da linha 18 (`status: dto.status ?? null,`), colar `funcaoOperadorId: dto.funcao_operador ?? null,` e `funcaoOperadorNome: dto.funcao_operador_nome ?? null,`.
- Depois da linha 32 (`password?: string;`, em `OperatorPayload`), colar `funcao_operador?: string | null;`.

### 7. Repository e Store

`features/operators/api/OperatorRepository.ts`:
- Linhas 3–4, trocar por:

```ts
import type { FuncaoOperador, Operator } from "../types/operator";
import { funcaoOperadorListApiSchema, operatorApiSchema, operatorListApiSchema } from "../types/operatorSchemas";
```

- Depois da linha 15 (`unlink(id: string): Promise<void>;`), colar `  listFuncoes(): Promise<FuncaoOperador[]>;`.
- Depois da linha 51 (o `}` que fecha `unlink`), colar:

```ts

  async listFuncoes(): Promise<FuncaoOperador[]> {
    const response = await this.http.send<unknown>({ method: "GET", path: `${COLLECTION}/funcoes` });
    return funcaoOperadorListApiSchema.parse(response.data);
  }
```

`features/operators/api/OperatorStore.ts`:
- Linha 3, trocar por `import type { FuncaoOperador, Operator } from "../types/operator";`.
- Depois da linha 44 (o `}` que fecha `unlink`), colar:

```ts

  listFuncoes(): Promise<FuncaoOperador[]> {
    return this.repository.listFuncoes();
  }
```

### 8. Componente — `components/OperadoresPanel.tsx`

O painel guarda o formulário num único `useState<FormState>` e chama o `operatorStore` direto (`loadOperators`, linha 142). Siga esse padrão.

| Linha original | Ação |
| --- | --- |
| 18 | Trocar por `import type { FuncaoOperador, Operator } from "@/features/operators/types/operator";` |
| depois da 43 (`password: string;`, em `type FormState`) | `  funcaoOperador: string;` |
| depois da 56 (`password: "",`, em `EMPTY_FORM`) | `  funcaoOperador: "",` |
| depois da 103 (`password: "",`, em `operatorToForm`) | `    funcaoOperador: operator.funcaoOperadorId ?? "",` (preenche o Editar) |
| depois da 132 (`const [loadFailed, setLoadFailed] = useState(false);`) | `  const [funcoes, setFuncoes] = useState<FuncaoOperador[]>([]);` |
| depois da 157 (`}, [loadOperators]);`) | `useEffect` abaixo |
| depois da 262 (`cep: clearSpecialChars(form.cep),`, em `payload`) | `      funcao_operador: form.funcaoOperador \|\| null,` |
| depois da 483 (o `</div>` que fecha a grade Cidade/Estado) | select abaixo |
| depois da 607 (o `</p>` do e-mail no card) | exibição abaixo |

```tsx

  useEffect(() => {
    let ignored = false;
    operatorStore.listFuncoes()
      .then((value) => { if (!ignored) setFuncoes(value); })
      .catch(() => {});
    return () => { ignored = true; };
  }, []);
```

```tsx

            <div className="space-y-2">
              <label htmlFor={`${formId}-funcao`} className="text-[10px] font-bold uppercase tracking-widest text-outline">
                Função
              </label>
              <select
                id={`${formId}-funcao`}
                value={form.funcaoOperador}
                onChange={(e) => setForm((prev) => ({ ...prev, funcaoOperador: e.target.value }))}
                className={inputClass(false)}
              >
                <option value="">Não informada</option>
                {funcoes.map((funcao) => (
                  <option key={funcao.id} value={funcao.id}>{funcao.nome}</option>
                ))}
              </select>
            </div>
```

```tsx
                    <p className="text-xs text-outline font-medium uppercase tracking-wide">
                      Função: {operator.funcaoOperadorNome ?? "Não informada"}
                    </p>
```

**Por que `setForm` e não `setField`:** `setField` só aceita os campos validados (`PersonField`). A função é opcional e não passa por aquela validação.

## Testes que quebram

| Arquivo | Ajuste |
| --- | --- |
| `components/tests/OperadoresPanel.test.tsx`, linha 91 (body esperado do POST) | Acrescentar `funcao_operador: null,` |
| `features/dashboard/tests/accountSettings.test.tsx`, linha 16 (`vi.mock('@/app/container', ...)`) | No objeto `operatorStore`, acrescentar `listFuncoes: () => Promise.resolve([])` |

Sem os ajustes, 3 testes falham (`operatorStore.listFuncoes is not a function` e o body sem o campo novo).

## Demonstrar

```sql
SELECT id, nome FROM funcoes_operador;

SELECT u.name, u.employer_id, f.nome
FROM users u LEFT JOIN funcoes_operador f ON f.id = u.funcao_operador_id
WHERE u.role = 'operador';
```

Para demonstrar:

1. Abra a aba Operadores e cadastre um operador com uma função.
2. Aperte F5: o card mostra "Função: …".
3. Clique em Editar: o select vem preenchido. Troque, salve e aperte F5.
