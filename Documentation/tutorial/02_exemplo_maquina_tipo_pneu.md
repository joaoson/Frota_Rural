# Exemplo completo — Máquina com tipo de pneu

> **Pedido de exemplo:** "No cadastro de máquina, adicione um dropdown com 3 tipos de pneu. Salve a escolha e mostre o tipo de pneu na listagem da frota."

Este é o guia de referência. Os guias de [modelos](README.md#guias-por-tela) seguem os mesmos 12 passos, só mudando arquivos e nomes.

Este exemplo foi aplicado e testado numa cópia limpa do código, com migrations aplicadas, API testada, tela testada com F5 e testes unitários verdes.

**Como ler as linhas:** "depois da linha 30" se refere ao arquivo **original**, sem nenhuma alteração sua (commit `0ca8c7e`, base do PR para `develop`). Se você já colou algo antes no mesmo arquivo, os números andam. Por isso cada passo também traz a **âncora**, um trecho de código que você procura com `Ctrl+F`.

## Mapa do que muda

| # | Requisito | Arquivo | O que fazer |
| --- | --- | --- | --- |
| 1 | Tabela nova | `BackEnd/machines/models.py` | Criar a classe `TipoPneu` |
| 2 | Relacionamento | `BackEnd/machines/models.py` | Campo `tipo_pneu` (FK) em `Machines` |
| 3 | Três registros | `BackEnd/machines/migrations/` | Gerar migrations e preencher a de dados |
| 4 | API grava o ID | `BackEnd/machines/serializer.py` | `tipo_pneu` na entrada e na saída; serializer do catálogo |
| 5 | API do catálogo | `BackEnd/machines/services.py` | `TipoPneuService.list()` |
| 6 | API do catálogo | `BackEnd/machines/views.py` + `urls.py` | `GET /api/machines/tipos-pneu` |
| 7 | Contrato no front | `FrontEnd/src/features/machines/types/` | Tipos e schemas Zod |
| 8 | Contrato no front | `FrontEnd/src/features/machines/api/machineMapper.ts` | Ler e enviar o campo |
| 9 | Buscar as opções | `MachineRepository.ts`, `MachineStore.ts`, `hooks/useTiposPneu.ts` | Buscar o catálogo |
| 10 | Componente | `FrontEnd/src/pages/machines/NovoEquipamento.tsx` | `<select>` com as 3 opções |
| 11 | Exibição | `FrontEnd/src/pages/dashboard/DashboardLocador.tsx` | "Pneu: Radial" no card da frota |
| 12 | Edição (opcional) | `EditEquipamentoModal.tsx` + `DashboardLocador.tsx` | Trocar o pneu pelo botão Editar |

```text
Banco                Backend (Django)                          Frontend (React)
tipos_pneu ◄── FK ── machines.tipo_pneu_id
   ▲                 GET  /api/machines/tipos-pneu  ─────────► useTiposPneu → <select>
   │                 POST /api/machines {tipo_pneu: "<id>"} ◄── NovoEquipamento (submit)
   └──── JOIN ────── GET  /api/machines → tipo_pneu_nome ────► card "Pneu: Radial"
```

---

## Backend

### Passo 1 — Criar a tabela nova

**Arquivo:** `BackEnd/machines/models.py`

**1a.** Linha 1, antes de `from django.db import models`, colar:

```python
import uuid

```

**1b.** Depois da linha 5, antes de `class Machines(models.Model):` (linha 6), colar:

```python
class TipoPneu(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=60, unique=True)

    class Meta:
        db_table = "tipos_pneu"
        ordering = ["nome"]

    def __str__(self) -> str:
        return self.nome


```

**Por quê:**
- `id` é UUID porque todas as tabelas do projeto usam UUID.
- `unique=True` impede duas opções com o mesmo nome.
- `db_table` define o nome da tabela no banco (`tipos_pneu`).
- A classe fica antes de `Machines` porque a FK do passo 2 aponta para ela.

### Passo 2 — Relacionar com a tabela existente (FK)

**Mesmo arquivo.** Depois da linha 30 (`updated_at = models.DateTimeField(blank=True, null=True)`), antes de `class Meta:` (linha 32), colar:

```python
    tipo_pneu = models.ForeignKey(TipoPneu, models.PROTECT, blank=True, null=True)
```

**Por quê:**
- No banco, isso vira a coluna `machines.tipo_pneu_id`, que guarda o **ID** de um registro de `tipos_pneu`. É esse o requisito "persistir referenciando o ID".
- `null=True` mantém válidas as máquinas que já existem e não têm pneu.
- `PROTECT` impede apagar um tipo de pneu que alguma máquina usa.

### Passo 3 — Migrations e os três registros

No terminal, dentro de `BackEnd/`, rode os comandos abaixo. No Docker, use `docker compose exec backend python manage.py ...`; no Django nativo, veja o [guia 05](05_ambiente_dev_e_banco_isolado.md).

```bash
python manage.py makemigrations machines
# Cria 0004_tipopneu_machines_tipo_pneu.py  (+ Create model TipoPneu, + Add field tipo_pneu)

python manage.py makemigrations machines --empty --name tipos_pneu_iniciais
# Cria 0005_tipos_pneu_iniciais.py vazia
```

**Arquivo:** `BackEnd/machines/migrations/0005_tipos_pneu_iniciais.py`. Apague o conteúdo e cole o arquivo inteiro:

```python
from django.db import migrations

TIPOS_PNEU = [
    ("1f0c2b8e-0000-4000-8000-000000000001", "Radial"),
    ("1f0c2b8e-0000-4000-8000-000000000002", "Diagonal"),
    ("1f0c2b8e-0000-4000-8000-000000000003", "Alta flutuação"),
]


def inserir_tipos(apps, schema_editor):
    TipoPneu = apps.get_model("machines", "TipoPneu")
    for id_, nome in TIPOS_PNEU:
        TipoPneu.objects.update_or_create(id=id_, defaults={"nome": nome})


def remover_tipos(apps, schema_editor):
    TipoPneu = apps.get_model("machines", "TipoPneu")
    TipoPneu.objects.filter(id__in=[id_ for id_, _ in TIPOS_PNEU]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("machines", "0004_tipopneu_machines_tipo_pneu"),
    ]

    operations = [
        migrations.RunPython(inserir_tipos, remover_tipos),
    ]
```

```bash
python manage.py migrate
python manage.py showmigrations machines
# [X] 0004_tipopneu_machines_tipo_pneu
# [X] 0005_tipos_pneu_iniciais
```

**Por quê:**
- Uma migration de dados insere os três registros em qualquer banco: o seu, o dos colegas e o do CI.
- IDs fixos facilitam mostrar no banco qual ID foi gravado.
- Confira se o nome em `dependencies` é o mesmo do arquivo gerado no primeiro comando. Se o Django gerar outro nome, mantenha o que ele gerou.

**Se o professor pedir para inserir direto no banco** (DBeaver/psql), depois do primeiro `migrate`, em vez da migration de dados:

```sql
INSERT INTO tipos_pneu (id, nome) VALUES
  (gen_random_uuid(), 'Radial'),
  (gen_random_uuid(), 'Diagonal'),
  (gen_random_uuid(), 'Alta flutuação');
```

### Passo 4 — Serializers: aceitar e devolver o campo

**Arquivo:** `BackEnd/machines/serializer.py`

**4a.** Linha 8, trocar:

```python
from machines.models import Machines
```

por:

```python
from machines.models import Machines, TipoPneu
```

**4b. Entrada.** Em `MachineInputSerializer.Meta.fields`, depois da linha 32 (`"status",`), colar:

```python
            "tipo_pneu",
```

**4c. Saída.** Depois da linha 75 (`class MachineOutputSerializer(serializers.ModelSerializer[Machines]):`), antes de `class Meta:`, colar:

```python
    tipo_pneu_nome = serializers.CharField(source="tipo_pneu.nome", read_only=True, allow_null=True)

```

**4d.** Em `MachineOutputSerializer.Meta.fields`, depois da linha 92 (`"updated_at",`), colar:

```python
            "tipo_pneu",
            "tipo_pneu_nome",
```

**4e. Serializer do catálogo.** Depois da linha 94 (`read_only_fields = fields`, fim de `MachineOutputSerializer`), antes de `class MachineFilterSerializer`, colar:

```python


class TipoPneuOutputSerializer(serializers.ModelSerializer[TipoPneu]):
    class Meta:
        model = TipoPneu
        fields = ["id", "nome"]
        read_only_fields = fields
```

**Por quê:**
- Com `"tipo_pneu"` na lista de entrada, o DRF aceita o UUID e confere se ele existe. Um ID inexistente devolve 400 com `Pk inválido`.
- Na saída, `tipo_pneu` é o ID e `tipo_pneu_nome` é o texto que vai para a tela.
- `allow_null=True` faz máquinas sem pneu devolverem `null`, em vez de o campo sumir da resposta.

### Passo 5 — Service do catálogo

**Arquivo:** `BackEnd/machines/services.py`

**5a.** Linha 13, trocar:

```python
from machines.models import Machines
```

por:

```python
from machines.models import Machines, TipoPneu
```

**5b.** No fim do arquivo, depois da linha 95, colar:

```python


class TipoPneuService:
    @staticmethod
    def list() -> QuerySet[TipoPneu]:
        return TipoPneu.objects.order_by("nome")
```

**Não precisa mexer em `MachineService.create` nem em `update`:** os dois já chamam `serializer.save()`, que grava o `tipo_pneu` validado no passo 4.

### Passo 6 — View e rota do catálogo

**Arquivo:** `BackEnd/machines/views.py`

**6a.** No bloco de import das linhas 12–17, depois da linha 15 (`MachineOutputSerializer,`), colar `TipoPneuOutputSerializer,`. Na linha 17, trocar o import do service. O resultado fica assim:

```python
from machines.serializer import (
    MachineFilterSerializer,
    MachineInputSerializer,
    MachineOutputSerializer,
    TipoPneuOutputSerializer,
)
from machines.services import MachineService, TipoPneuService
```

**6b.** No fim do arquivo, depois da linha 139, colar:

```python


class TipoPneuListView(APIView):
    permission_classes = [IsAuthenticatedOrReadOnly]

    @extend_schema(
        tags=TAGS,
        summary="Listar tipos de pneu",
        description="Opções da tabela `tipos_pneu` usadas no cadastro de máquinas.",
        responses={200: TipoPneuOutputSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        tipos = TipoPneuService.list()
        return Response(TipoPneuOutputSerializer(tipos, many=True).data, status=status.HTTP_200_OK)
```

**Arquivo:** `BackEnd/machines/urls.py`

**6c.** Linha 3, trocar por:

```python
from machines.views import MachineDetailView, MachineListView, TipoPneuListView
```

**6d.** Depois da linha 7 (`path("machines/<uuid:pk>", ...)`), colar:

```python
    path("machines/tipos-pneu", TipoPneuListView.as_view(), name="machine_tipos_pneu"),
```

**Testar antes de ir para o front.** No Swagger (`/api/schema/swagger-ui`), o grupo **Maquinário** passa a mostrar "Listar tipos de pneu".

```text
GET /api/machines/tipos-pneu
→ 200 [{"id": "1f0c…0003", "nome": "Alta flutuação"}, {"id": "1f0c…0002", "nome": "Diagonal"}, {"id": "1f0c…0001", "nome": "Radial"}]

PATCH /api/machines/<id>   {"tipo_pneu": "1f0c2b8e-0000-4000-8000-000000000001"}
→ 200 {..., "tipo_pneu": "1f0c…0001", "tipo_pneu_nome": "Radial"}

PATCH /api/machines/<id>   {"tipo_pneu": "00000000-0000-4000-8000-000000000999"}
→ 400 {"errors": {"tipo_pneu": ["Pk inválido \"…\" - objeto não existe."]}}
```

---

## Frontend

Caminhos relativos a `FrontEnd/src/`.

### Passo 7 — Tipos e schemas

**Arquivo:** `features/machines/types/machine.ts`

**7a.** Depois da linha 14 (`updatedAt: Date | null;`), dentro de `interface Machine`, colar:

```ts
  tipoPneuId: string | null;
  tipoPneuNome: string | null;
```

**7b.** Depois da linha 15 (o `}` que fecha `Machine`), colar:

```ts

export interface TipoPneu {
  id: string;
  nome: string;
}
```

**Arquivo:** `features/machines/types/machineSchemas.ts`

**7c.** Em `machineApiSchema`, depois da linha 34 (`updated_at: z.string().nullish(),`), colar:

```ts
  tipo_pneu: z.string().nullish(),
  tipo_pneu_nome: z.string().nullish(),
```

**7d.** Depois da linha 39 (`export const machineListApiSchema = z.array(machineApiSchema);`), colar:

```ts

export const tipoPneuApiSchema = z.object({
  id: z.string(),
  nome: z.string(),
});

export const tipoPneuListApiSchema = z.array(tipoPneuApiSchema);
```

**7e.** Em `machineFormSchema`, depois da linha 65 (`technicalSpecifications: z.string().trim(),`), colar:

```ts
    tipoPneu: z.string(),
```

Para tornar o campo obrigatório, use `tipoPneu: z.string().min(1, "Selecione o tipo de pneu."),`.

**7f.** Em `CreateMachinePayload`, depois da linha 88 (`usage_purpose?: string;`), colar:

```ts
  tipo_pneu?: string | null;
```

**Por quê:**
- O Zod valida a resposta da API. Um campo que não está no schema é descartado e nunca chega à tela.
- `snake_case` é o formato da API; `camelCase` é o do domínio React. O mapper do passo 8 converte um no outro.

### Passo 8 — Mapper (API ⇄ domínio)

**Arquivo:** `features/machines/api/machineMapper.ts`

**8a.** Em `toDomain`, depois da linha 29 (`updatedAt: toDate(dto.updated_at),`), colar:

```ts
    tipoPneuId: dto.tipo_pneu ?? null,
    tipoPneuNome: dto.tipo_pneu_nome ?? null,
```

**8b.** Em `toCreatePayload`, depois da linha 49 (`usage_purpose: values.usagePurpose,`), colar:

```ts
    tipo_pneu: values.tipoPneu || null,
```

`|| null` envia `null` quando nada foi escolhido (`""`), e o backend aceita.

### Passo 9 — Buscar as 3 opções (Repository → Store → hook)

**Arquivo:** `features/machines/api/MachineRepository.ts`

**9a.** Linha 3, trocar por:

```ts
import type { Machine, TipoPneu } from "../types/machine";
```

**9b.** No import das linhas 4–8, depois da linha 7 (`machineListApiSchema,`), colar:

```ts
  tipoPneuListApiSchema,
```

**9c.** Em `interface MachineRepository`, depois da linha 24 (`remove(id: string): Promise<void>;`), colar:

```ts
  listTiposPneu(): Promise<TipoPneu[]>;
```

**9d.** Dentro de `HttpMachineRepository`, depois da linha 71 (o `}` que fecha `remove`), antes do `}` final da classe, colar:

```ts

  async listTiposPneu(): Promise<TipoPneu[]> {
    const response = await this.http.send<unknown>({ method: "GET", path: "machines/tipos-pneu" });
    return tipoPneuListApiSchema.parse(response.data);
  }
```

**Arquivo:** `features/machines/api/MachineStore.ts`

**9e.** Linha 3, trocar por:

```ts
import type { Machine, TipoPneu } from "../types/machine";
```

**9f.** Em `machineKeys`, depois da linha 10 (`list: (filter: MachineFilter) => ...`), colar:

```ts
  tiposPneu: () => [...machineKeys.all, "tipos-pneu"] as const,
```

**9g.** Depois da linha 29 (o `}` que fecha `listOptions`), antes de `create(`, colar:

```ts

  tiposPneuOptions(): UseQueryOptions<TipoPneu[], Error, TipoPneu[], ReturnType<typeof machineKeys.tiposPneu>> {
    return {
      queryKey: machineKeys.tiposPneu(),
      queryFn: () => this.repository.listTiposPneu(),
    };
  }
```

**Arquivo novo:** `features/machines/hooks/useTiposPneu.ts`. Cole o arquivo inteiro:

```ts
import { useQuery } from "@tanstack/react-query";

import { machineStore } from "@/app/container";

export function useTiposPneu() {
  return useQuery(machineStore.tiposPneuOptions());
}
```

**Por quê:** é o mesmo caminho que `useMachines` usa para buscar a frota: página → hook → Store (cache do React Query) → Repository (HTTP + Zod). Assim fica fácil explicar na defesa por onde o dado passa.

### Passo 10 — O componente: dropdown no cadastro

**Arquivo:** `features/machines/hooks/useMachineForm.ts`

**10a.** Em `MACHINE_FORM_DEFAULTS`, depois da linha 15 (`technicalSpecifications: "",`), colar:

```ts
  tipoPneu: "",
```

**Arquivo:** `pages/machines/NovoEquipamento.tsx`

**10b.** Depois da linha 6 (`import { useCreateMachine } ...`), colar:

```tsx
import { useTiposPneu } from "@/features/machines/hooks/useTiposPneu";
```

**10c.** Em `API_FIELD_TO_FORM`, depois da linha 29 (`technical_specifications: "technicalSpecifications",`), colar:

```tsx
  tipo_pneu: "tipoPneu",
```

Isso faz um erro 400 do backend aparecer embaixo do select.

**10d.** Depois da linha 35 (`const createMachine = useCreateMachine();`), colar:

```tsx
  const tiposPneu = useTiposPneu();
```

**10e.** Depois da linha 138 (o `</div>` que fecha a grade "Ano de Fabricação / Finalidade de Uso"), antes de `<div className="grid grid-cols-2 gap-5">` da Potência (linha 140), colar:

```tsx
        <FormField label="Tipo de Pneu" error={errors.tipoPneu?.message}>
          <select
            className={inputClass(Boolean(errors.tipoPneu))}
            disabled={tiposPneu.isLoading}
            {...form.register("tipoPneu")}
          >
            <option value="">Selecione o tipo de pneu</option>
            {(tiposPneu.data ?? []).map((tipo) => (
              <option key={tipo.id} value={tipo.id}>{tipo.nome}</option>
            ))}
          </select>
        </FormField>

```

**Por quê:**
- O `value` de cada `<option>` é o **ID** do registro; o texto mostrado é o `nome`.
- `form.register("tipoPneu")` liga o select ao formulário. No submit, `toCreatePayload` (passo 8b) envia `tipo_pneu: <id>`.
- O submit não muda: `createMachine.mutateAsync(toCreatePayload(values, userId))`, na linha 48, já faz o `POST /api/machines`.

### Passo 11 — Exibir o dado persistido

**Arquivo:** `pages/dashboard/DashboardLocador.tsx`

**11a.** No `useMemo` de `machines`, depois da linha 129 (`purpose: m.usagePurpose ?? "",`), colar:

```tsx
        tipoPneu: m.tipoPneuNome,
        tipoPneuId: m.tipoPneuId,
```

**11b.** No card da aba "Minha frota", depois da linha 806 (o `</p>` de `Finalidade: {m.purpose || "Não informada"}`), colar:

```tsx
                    <p className="text-xs text-outline font-medium tracking-wide uppercase mt-1">
                      Pneu: {m.tipoPneu ?? "Não informado"}
                    </p>
```

**Por quê:** o nome vem do banco (`GET /api/machines` → `tipo_pneu_nome`), não do formulário. Recarregue com F5: se aparecer "Pneu: Radial", ficou comprovado que o dado foi persistido.

### Passo 12 — Editar o pneu (opcional, mas comum na defesa)

**Arquivo:** `components/EditEquipamentoModal.tsx`

**12a.** Depois da linha 10 (`import { HttpError } ...`), colar:

```tsx
import type { TipoPneu } from "@/features/machines/types/machine";
```

**12b.** Em `interface EquipamentoData`, depois da linha 26 (`especificacoes: string;`), colar:

```tsx
  tipoPneuId: string;
```

**12c.** Em `interface EditEquipamentoModalProps`, depois da linha 33 (`onSave: ...`), colar:

```tsx
  tiposPneu?: TipoPneu[];
```

**12d.** Na desestruturação dos props, depois da linha 43 (`onSave,`), colar:

```tsx
  tiposPneu = [],
```

**12e.** Depois da linha 195 (o `</div>` que fecha a grade "Ano / Finalidade"), antes de `{/* Potência / Horímetro */}`, colar:

```tsx

            <div className="space-y-1.5">
              <label htmlFor="tipo-pneu" className={labelClass}>Tipo de Pneu</label>
              <select id="tipo-pneu"
                value={form.tipoPneuId}
                onChange={(e) => handleChange("tipoPneuId", e.target.value)}
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
              >
                <option value="">Não informado</option>
                {tiposPneu.map((tipo) => (
                  <option key={tipo.id} value={tipo.id}>{tipo.nome}</option>
                ))}
              </select>
            </div>
```

**Arquivo:** `pages/dashboard/DashboardLocador.tsx`

| Onde (linha original) | Colar |
| --- | --- |
| Depois da 6 (`import { useUpdateMachine } ...`) | `import { useTiposPneu } from "@/features/machines/hooks/useTiposPneu";` |
| Depois da 109 (`const updateMachine = useUpdateMachine();`) | `const tiposPneuQuery = useTiposPneu();` |
| Depois da 194 (`especificacoes: "",`, estado inicial) | `tipoPneuId: "",` |
| Depois da 207 (`especificacoes: m.specifications ?? "",`) | `tipoPneuId: m.tipoPneuId ?? "",` |
| Depois da 354 (`equipamento={selectedEquipamento}`) | `tiposPneu={tiposPneuQuery.data ?? []}` |
| Depois da 366 (`technical_specifications: data.especificacoes.trim(),`) | `tipo_pneu: data.tipoPneuId \|\| null,` |

**Por quê:** as opções são passadas como prop, em vez de o modal chamar `useTiposPneu()` sozinho. Assim os testes do modal, que renderizam sem React Query, continuam funcionando.

---

## Testes que quebram e como ajustar

Rodar `npx tsc -b` e `npx vitest run src/features/machines src/pages/machines src/pages/dashboard` dentro de `FrontEnd/`. Sem estes ajustes, o `tsc` acusa 1 erro e 13 testes falham:

| Arquivo | Linha original | Ajuste |
| --- | --- | --- |
| `features/machines/tests/EditEquipamentoModal.test.tsx` | depois da 11 (`finalidade: "Plantio", especificacoes: "Cabine",`) | `tipoPneuId: "",` |
| `pages/dashboard/tests/DashboardLocador.test.tsx` | depois da 12 (mock de `useUpdateMachine`) | `vi.mock("@/features/machines/hooks/useTiposPneu", () => ({ useTiposPneu: () => ({ data: [] }) }));` |
| `pages/machines/tests/NovoEquipamento.test.tsx` | 17 (`const api = ...`) | Responder também `"GET machines/tipos-pneu"` (bloco abaixo) |
| idem | 35 (`technical_specifications: "Plataforma 35 pés", usage_purpose: "Colheita",`) | Acrescentar `tipo_pneu: null` no fim do objeto, ou o ID escolhido no teste |
| idem | 62 e 87 (`expect(net.http.send).not.toHaveBeenCalled();`) | `expect(net.http.send).not.toHaveBeenCalledWith(expect.objectContaining({ method: "POST" }));` |

```tsx
// NovoEquipamento.test.tsx, linha 17 — substituir a linha `const api = ...` por:
const TIPOS_PNEU = [{ id: "pneu-radial", nome: "Radial" }, { id: "pneu-diagonal", nome: "Diagonal" }];
const api = (routes: Record<string, Route> = {}) => serve(net.http, { "GET machines/tipos-pneu": () => TIPOS_PNEU, "POST machines": () => machineDto(), ...routes });
```

**Por quê:** agora a tela faz um `GET` ao abrir. Testes que esperavam "nenhuma chamada HTTP" passam a ver esse GET. Os que mockam o `@/app/container` inteiro não conhecem o `machineStore`.

## Como demonstrar na defesa

1. **Tabela e registros:** no DBeaver, rode `SELECT id, nome FROM tipos_pneu;` e mostre as 3 linhas.
2. **Componente:** abra `/dashboard/novo-equipamento` e mostre o dropdown com as 3 opções vindas da API. No DevTools, aba Network, aparece `tipos-pneu`.
3. **Persistência com ID:** cadastre uma máquina com "Alta flutuação" e rode:
   ```sql
   SELECT m.brand, m.model, m.tipo_pneu_id, t.nome
   FROM machines m LEFT JOIN tipos_pneu t ON t.id = m.tipo_pneu_id
   ORDER BY m.created_at DESC LIMIT 3;
   ```
4. **Exibição:** abra `/dashboard?tab=frota`, aperte F5 e mostre "Pneu: Alta flutuação" no card.
5. **Explicar o caminho:**
   ```text
   select → toCreatePayload → MachineRepository.create (POST) → MachineInputSerializer
   → MachineService.create → serializer.save() → machines.tipo_pneu_id
   ```
   E na leitura:
   ```text
   GET → MachineOutputSerializer.tipo_pneu_nome → Zod → toDomain → card
   ```
