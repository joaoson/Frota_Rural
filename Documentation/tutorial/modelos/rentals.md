# Locações — `Rentals`

> **Pedido de exemplo:** "Na reserva de uma máquina, o locatário escolhe o tipo de cultura (3 opções). Mostre a cultura no card da locação."

**Telas:** reservar (`/reservar/<id do anúncio>` → `pages/postings/Reservar.tsx`); exibir no card de locação (`features/dashboard/components/RentalCard.tsx`), usado nos dois painéis.

**Testado numa cópia limpa:** escolher "Milho" → `POST /api/rentals` 201 com `tipo_cultura_nome: "Milho"` → card mostra "Cultura: Milho" após F5.

**Atenção:** a locação é criada quando você clica em **"Pagar e Avançar"**, antes do Stripe. Sem chaves do Stripe, aparece o erro de pagamento, mas a locação já foi gravada como `pending`. Isso basta para demonstrar.

O raciocínio de cada passo está no [exemplo de máquina](../02_exemplo_maquina_tipo_pneu.md). As linhas são do arquivo **original**.

## Mapa

| # | Arquivo | O que |
| --- | --- | --- |
| 1 | `BackEnd/rentals/models.py` | `TipoCultura` + FK `tipo_cultura` |
| 2 | `BackEnd/rentals/migrations/` | schema + 3 registros |
| 3 | `BackEnd/rentals/serializer.py` | entrada, saída, catálogo |
| 4 | `BackEnd/rentals/services.py` | `TipoCulturaService` |
| 5 | `BackEnd/rentals/views.py` + `urls.py` | `GET /api/rentals/tipos-cultura` |
| 6 | `features/contracts/types/rentalSchemas.ts`, `rental.ts` | Zod e tipos |
| 7 | `features/contracts/api/contractMapper.ts` | ler o campo |
| 8 | `ContractRepository.ts`, `ContractStore.ts` | buscar o catálogo |
| 9 | `pages/postings/Reservar.tsx` | select + enviar na criação |
| 10 | `RentalCard.tsx`, `DashboardLocatario.tsx`, `DashboardLocador.tsx` | exibir |

A parte de locação no frontend fica na feature **`contracts`**, e não numa feature `rentals`.

## Backend

### 1. Model — `BackEnd/rentals/models.py`

Linha 1: colar `import uuid` e uma linha em branco antes de `from django.db import models`.

Depois da linha 5, antes de `class Rentals(models.Model):`:

```python
class TipoCultura(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=60, unique=True)

    class Meta:
        db_table = "tipos_cultura"
        ordering = ["nome"]

    def __str__(self) -> str:
        return self.nome


```

Depois da linha 46 (`reservation_expires_at = models.DateTimeField(blank=True, null=True)`), antes de `class Meta:` (linha 48):

```python
    tipo_cultura = models.ForeignKey(TipoCultura, models.PROTECT, blank=True, null=True)
```

### 2. Migrations

```bash
python manage.py makemigrations rentals
# 0008_tipocultura_rentals_tipo_cultura.py
python manage.py makemigrations rentals --empty --name tipos_cultura_iniciais
# 0009_tipos_cultura_iniciais.py
```

Conteúdo inteiro de `0009_tipos_cultura_iniciais.py`:

```python
from django.db import migrations

TIPOS_CULTURA = [
    ("3b8e5d20-0000-4000-8000-000000000001", "Soja"),
    ("3b8e5d20-0000-4000-8000-000000000002", "Milho"),
    ("3b8e5d20-0000-4000-8000-000000000003", "Trigo"),
]


def inserir_tipos(apps, schema_editor):
    TipoCultura = apps.get_model("rentals", "TipoCultura")
    for id_, nome in TIPOS_CULTURA:
        TipoCultura.objects.update_or_create(id=id_, defaults={"nome": nome})


def remover_tipos(apps, schema_editor):
    TipoCultura = apps.get_model("rentals", "TipoCultura")
    TipoCultura.objects.filter(id__in=[id_ for id_, _ in TIPOS_CULTURA]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("rentals", "0008_tipocultura_rentals_tipo_cultura"),
    ]

    operations = [
        migrations.RunPython(inserir_tipos, remover_tipos),
    ]
```

```bash
python manage.py migrate
```

### 3. Serializers — `BackEnd/rentals/serializer.py`

| Linha original | Ação |
| --- | --- |
| 12 | Trocar por `from rentals.models import RentalMeterReadings, Rentals, TipoCultura` |
| depois da 58 (`"status",` em `RentalInputSerializer.Meta.fields`) | `"tipo_cultura",` |
| depois da 138 (o `)` que fecha `meter = serializers.SerializerMethodField(...)`) | `tipo_cultura_nome = serializers.CharField(source="tipo_cultura.nome", read_only=True, allow_null=True)` (com 4 espaços de recuo) |
| depois da 183 (`"accepted_by_lessee",` em `RentalOutputSerializer.Meta.fields`) | `"tipo_cultura",` e `"tipo_cultura_nome",` |
| fim do arquivo (depois da 242) | serializer do catálogo |

```python


class TipoCulturaOutputSerializer(serializers.ModelSerializer[TipoCultura]):
    class Meta:
        model = TipoCultura
        fields = ["id", "nome"]
        read_only_fields = fields
```

`RentalCreateInputSerializer`, em `rentals/schema.py` (documentação do Swagger), herda os campos de `RentalInputSerializer`, então já mostra `tipo_cultura`.

**Gravação:** em `RentalService.create` (`rentals/services.py:56`), o `serializer.save(...)` da linha 76 grava o `tipo_cultura` validado. Não precisa mexer no service da reserva.

### 4. Service — `BackEnd/rentals/services.py`

Linha 23, trocar por `from rentals.models import Rentals, TipoCultura`. No fim (depois da linha 187):

```python


class TipoCulturaService:
    @staticmethod
    def list() -> QuerySet[TipoCultura]:
        return TipoCultura.objects.order_by("nome")
```

### 5. View e rota

`BackEnd/rentals/views.py`:

- Depois da linha 23 (`RentalOutputSerializer,`), colar `    TipoCulturaOutputSerializer,`.
- Linha 26, trocar por `from rentals.services import RentalService, TipoCulturaService`.
- No fim (depois da linha 329), colar:

```python


class TipoCulturaListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Listar tipos de cultura",
        description="Opções da tabela `tipos_cultura` usadas na reserva.",
        responses={200: TipoCulturaOutputSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        tipos = TipoCulturaService.list()
        return Response(TipoCulturaOutputSerializer(tipos, many=True).data, status=status.HTTP_200_OK)
```

`BackEnd/rentals/urls.py`:

- Depois da linha 11 (`RentalMeterReadingsView,`), colar `    TipoCulturaListView,`.
- Depois da linha 20 (`path("rentals/policy", ...)`), colar:

```python
    path("rentals/tipos-cultura", TipoCulturaListView.as_view(), name="rental_tipos_cultura"),
```

## Frontend (`FrontEnd/src/`)

### 6. Zod e tipos

`features/contracts/types/rentalSchemas.ts`:

| Linha original | Colar |
| --- | --- |
| depois da 36 (`notes: z.string().nullish(),` em `rentalApiSchema`) | `tipo_cultura: z.string().nullish(),` e `tipo_cultura_nome: z.string().nullish(),` |
| depois da 93 (`notes?: string;` em `CreateRentalPayload`) | `tipo_cultura?: string \| null;` |
| depois da 94 (o `}` que fecha `CreateRentalPayload`) | bloco abaixo |

```ts

export const tipoCulturaListApiSchema = z.array(
  z.object({ id: z.string(), nome: z.string() }),
);
```

`features/contracts/types/rental.ts`:

- Depois da linha 38 (`notes?: string;`, dentro de `Rental`), colar `tipoCulturaId?: string | null;` e `tipoCulturaNome?: string | null;`. São opcionais (`?`) porque vários testes montam objetos `Rental` à mão.
- Depois da linha 44 (o `}` que fecha `Rental`), colar:

```ts

export interface TipoCultura {
  id: string;
  nome: string;
}
```

### 7. Mapper — `features/contracts/api/contractMapper.ts`

Depois da linha 67 (`notes: dto.notes ?? "",`), colar:

```ts
    tipoCulturaId: dto.tipo_cultura ?? null,
    tipoCulturaNome: dto.tipo_cultura_nome ?? null,
```

### 8. Repository e Store

`features/contracts/api/ContractRepository.ts`:

| Linha original | Colar |
| --- | --- |
| depois da 16 (`SignatureReceipt,`) | `  TipoCultura,` |
| depois da 28 (`type SignatureRole,`) | `  tipoCulturaListApiSchema,` |
| depois da 71 (`findEvidence(id: string): Promise<ContractEvidence>;`) | `  listTiposCultura(): Promise<TipoCultura[]>;` |
| depois da 272 (o `}` que fecha `findEvidence`), antes do `}` final | método abaixo |

```ts

  async listTiposCultura(): Promise<TipoCultura[]> {
    const response = await this.http.send<unknown>({ method: "GET", path: "rentals/tipos-cultura" });
    return tipoCulturaListApiSchema.parse(response.data);
  }
```

`features/contracts/api/ContractStore.ts`:

- Depois da linha 17 (`SignatureReceipt,`), colar `  TipoCultura,`.
- Depois da linha 72 (linha em branco depois de `quotePosting`), **antes** do comentário `/** Antecedência mínima ... */` da linha 73, colar o bloco abaixo. Ele não pode ficar entre o comentário e `bookingPolicy`, senão o comentário passa a "documentar" o método errado.

```ts
  listTiposCultura(): Promise<TipoCultura[]> {
    return this.repository.listTiposCultura();
  }

```

### 9. Componente — `pages/postings/Reservar.tsx`

Esta página usa `useState` + `useEffect` e chama o `contractStore` direto, sem React Query. Siga o mesmo padrão (é como ela carrega `bookingPolicy`).

| Linha original | Ação |
| --- | --- |
| 12 | Acrescentar `TipoCultura` ao import: `import type { BookingPolicy, RentalOccupancy, RentalQuote, Rental, SignatureEvidence, TipoCultura } from "@/features/contracts/types/rental";` |
| depois da 386 (`const [observacoes, setObservacoes] = useState("");`) | os dois estados abaixo |
| depois da 403 (`}, []);` do `useEffect` de `bookingPolicy`) | o `useEffect` abaixo |
| depois da 700 (`...(observacoes.trim() ? { notes: ... } : {}),`) | `          tipo_cultura: tipoCultura \|\| null,` |
| depois da 1013 (o `</div>` do campo Observações), antes do `<button` | o select abaixo |

```tsx
  const [tipoCultura, setTipoCultura] = useState("");
  const [tiposCultura, setTiposCultura] = useState<TipoCultura[]>([]);
```

```tsx
  useEffect(() => {
    let ignored = false;
    contractStore.listTiposCultura()
      .then((value) => { if (!ignored) setTiposCultura(value); })
      .catch(() => {});
    return () => { ignored = true; };
  }, []);
```

```tsx

                  <div className="mb-7">
                    <label htmlFor="tipo-cultura" className="text-[10px] uppercase font-bold text-outline tracking-widest mb-1.5 block">
                      Tipo de Cultura
                    </label>
                    <select id="tipo-cultura"
                      value={tipoCultura}
                      onChange={(e) => setTipoCultura(e.target.value)}
                      className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg px-4 py-3 text-sm text-tertiary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
                    >
                      <option value="">Selecione o tipo de cultura</option>
                      {tiposCultura.map((tipo) => (
                        <option key={tipo.id} value={tipo.id}>{tipo.nome}</option>
                      ))}
                    </select>
                  </div>
```

### 10. Exibição

`features/dashboard/components/RentalCard.tsx`:

- Depois da linha 18 (`notes?: string;`, em `RentalCardData`), colar `tipoCultura?: string | null;`.
- Depois da linha 205 (o `</Field>` de "Valor"), dentro da mesma grade, colar:

```tsx
          <Field label="Cultura">
            <div className="font-bold text-on-surface text-sm">{rental.tipoCultura ?? "Não informada"}</div>
          </Field>
```

Os painéis convertem `Rental` em `RentalCardData`:

| Arquivo | Depois da linha | Colar |
| --- | --- | --- |
| `pages/dashboard/DashboardLocatario.tsx` | 123 (`notes: rental.notes,`) | `tipoCultura: rental.tipoCulturaNome,` |
| `pages/dashboard/DashboardLocador.tsx` | 165 (`notes: r.notes,`) | `tipoCultura: r.tipoCulturaNome,` |

## Testes que quebram

`features/payments/tests/paymentReview.test.tsx` mocka o `contractStore` com uma lista fixa de métodos. Sem o ajuste abaixo, 10 testes falham com `contractStore.listTiposCultura is not a function`:

| Linha original | Ajuste |
| --- | --- |
| 10 (`const mocks = vi.hoisted(...)`) | Acrescentar `listTiposCultura: vi.fn()` ao objeto |
| 13 (`contractStore: { ... }`) | Acrescentar `listTiposCultura: mocks.listTiposCultura,` |
| depois da 22 (`mocks.bookingPolicy.mockRejectedValue(...)`, no `beforeEach`) | `mocks.listTiposCultura.mockResolvedValue([]);` |

Com o ajuste: 215 testes passam (contracts, dashboard, postings, payments).

## Demonstrar

```sql
SELECT id, nome FROM tipos_cultura;

SELECT r.id, r.status, t.nome
FROM rentals r LEFT JOIN tipos_cultura t ON t.id = r.tipo_cultura_id
ORDER BY r.created_at DESC LIMIT 3;
```

Para demonstrar:

1. Entre como locatário e abra `/reservar/<id do anúncio>`.
2. Escolha as datas, depois a cultura, e clique em "Avançar para Pagamento" → "Pagar e Avançar".
3. Abra "Minhas Locações", aperte F5 e mostre "Cultura: Milho" no card. O locador vê o mesmo card em "Locações".
