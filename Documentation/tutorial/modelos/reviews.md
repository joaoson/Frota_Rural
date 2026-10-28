# Avaliações — `Reviews`

> **Pedido de exemplo:** "Ao avaliar uma locação, escolha o critério principal (Pontualidade, Conservação da máquina, Comunicação). Mostre o critério na lista de avaliações."

**Telas:**
- O formulário de avaliação fica dentro do card de locação (`features/dashboard/components/RentalCard.tsx`). Ele aparece no botão "Avaliar" das locações **concluídas**, nos dois painéis.
- A exibição fica na aba Avaliações (`features/dashboard/components/ReviewsSection.tsx`).

**Testado numa cópia limpa:** locatário escolhe "Pontualidade" → `POST /api/reviews` devolve `criterio_nome: "Pontualidade"` → Avaliações mostra "Critério: Pontualidade" após F5.

**Para demonstrar, você precisa de uma locação com status `completed`.** O seed de demonstração já tem locações concluídas. Sem uma delas, o backend recusa com "A avaliação fica disponível após a conclusão da locação".

As linhas são do arquivo **original** (commit `0ca8c7e`).

## Backend

### 1. Model — `BackEnd/reviews/models.py`

Linha 1: colar `import uuid` e uma linha em branco antes de `from django.db import models`. Depois da linha 3, antes de `class Reviews(models.Model):`, colar:

```python
class CriterioAvaliacao(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=60, unique=True)

    class Meta:
        db_table = "criterios_avaliacao"
        ordering = ["nome"]

    def __str__(self) -> str:
        return self.nome


```

Depois da linha 13 (`created_at = models.DateTimeField(blank=True, null=True)`):

```python
    criterio = models.ForeignKey(CriterioAvaliacao, models.PROTECT, blank=True, null=True)
```

### 2. Migrations

```bash
python manage.py makemigrations reviews
# 0002_criterioavaliacao_reviews_criterio.py
python manage.py makemigrations reviews --empty --name criterios_avaliacao_iniciais
# 0003_criterios_avaliacao_iniciais.py
```

```python
from django.db import migrations

CRITERIOS = [
    ("6e1b8a50-0000-4000-8000-000000000001", "Pontualidade"),
    ("6e1b8a50-0000-4000-8000-000000000002", "Conservação da máquina"),
    ("6e1b8a50-0000-4000-8000-000000000003", "Comunicação"),
]


def inserir_criterios(apps, schema_editor):
    CriterioAvaliacao = apps.get_model("reviews", "CriterioAvaliacao")
    for id_, nome in CRITERIOS:
        CriterioAvaliacao.objects.update_or_create(id=id_, defaults={"nome": nome})


def remover_criterios(apps, schema_editor):
    CriterioAvaliacao = apps.get_model("reviews", "CriterioAvaliacao")
    CriterioAvaliacao.objects.filter(id__in=[id_ for id_, _ in CRITERIOS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("reviews", "0002_criterioavaliacao_reviews_criterio"),
    ]

    operations = [
        migrations.RunPython(inserir_criterios, remover_criterios),
    ]
```

### 3. Serializers — `BackEnd/reviews/serializer.py`

| Linha original | Ação |
| --- | --- |
| 6 | Trocar por `from reviews.models import CriterioAvaliacao, Reviews` |
| 16 | Trocar por `fields = ["rental", "reviewer", "reviewee", "rating", "comment", "criterio"]` |
| depois da 59 (`reviewee_name = ...`) | `    criterio_nome = serializers.CharField(source="criterio.nome", read_only=True, allow_null=True)` |
| depois da 72 (`"created_at",` em `ReviewOutputSerializer.Meta.fields`) | `"criterio",` e `"criterio_nome",` |
| fim (depois da 74) | serializer do catálogo |

```python


class CriterioAvaliacaoOutputSerializer(serializers.ModelSerializer[CriterioAvaliacao]):
    class Meta:
        model = CriterioAvaliacao
        fields = ["id", "nome"]
        read_only_fields = fields
```

**Gravação:** `ReviewService.create` (`reviews/services.py:37`) faz `serializer.save(id=uuid4(), created_at=...)`. Não muda.

### 4. Service — `BackEnd/reviews/services.py`

Linha 12, trocar por `from reviews.models import CriterioAvaliacao, Reviews`. No fim (depois da linha 84):

```python


class CriterioAvaliacaoService:
    @staticmethod
    def list() -> QuerySet[CriterioAvaliacao]:
        return CriterioAvaliacao.objects.order_by("nome")
```

### 5. View e rota

`BackEnd/reviews/views.py`:
- Depois da linha 11 (`from reviews.serializer import (`), colar `    CriterioAvaliacaoOutputSerializer,`.
- Linha 16, trocar por `from reviews.services import CriterioAvaliacaoService, ReviewService`.
- No fim (depois da linha 120), colar:

```python


class CriterioAvaliacaoListView(APIView):
    permission_classes = [IsAuthenticatedOrReadOnly]

    @extend_schema(
        tags=TAGS,
        summary="Listar critérios de avaliação",
        description="Opções da tabela `criterios_avaliacao` usadas ao avaliar uma locação.",
        responses={200: CriterioAvaliacaoOutputSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        criterios = CriterioAvaliacaoService.list()
        return Response(CriterioAvaliacaoOutputSerializer(criterios, many=True).data, status=status.HTTP_200_OK)
```

`BackEnd/reviews/urls.py`:
- Linha 3, trocar por `from reviews.views import CriterioAvaliacaoListView, ReviewDetailView, ReviewListView`.
- Depois da linha 7 (`path("reviews", ...)`), colar:

```python
    path("reviews/criterios", CriterioAvaliacaoListView.as_view(), name="review_criterios"),
```

## Frontend (`FrontEnd/src/`)

### 6. Zod, tipos e mapper (`features/reviews/`)

`types/reviewSchemas.ts`:

| Linha original | Colar |
| --- | --- |
| depois da 15 (`created_at: z.string().nullish(),`) | `criterio: z.string().nullish(),` e `criterio_nome: z.string().nullish(),` |
| depois da 18 (`export const reviewListApiSchema = ...`) | bloco abaixo |
| depois da 35 (`comment?: string;` em `CreateReviewPayload`) | `criterio?: string \| null;` |

```ts
export const criterioAvaliacaoListApiSchema = z.array(
  z.object({ id: z.string(), nome: z.string() }),
);
```

`types/review.ts`:
- Depois da linha 10 (`createdAt: Date | null;`), colar `criterioNome?: string | null;`. É opcional porque testes montam `Review` à mão.
- Depois da linha 11 (o `}`), colar:

```ts

export interface CriterioAvaliacao {
  id: string;
  nome: string;
}
```

`api/reviewMapper.ts`: depois da linha 14 (`createdAt: ...`), colar `criterioNome: dto.criterio_nome ?? null,`.

### 7. Repository, Store e hook

`api/ReviewRepository.ts`:

| Linha original | Ação |
| --- | --- |
| 3 | Trocar por `import type { CriterioAvaliacao, Review } from "../types/review";` |
| depois da 4 (`import {`) | `  criterioAvaliacaoListApiSchema,` |
| depois da 22 (`remove(id: string): Promise<void>;`) | `  listCriterios(): Promise<CriterioAvaliacao[]>;` |
| depois da 56 (o `}` que fecha `remove`) | método abaixo |

```ts

  async listCriterios(): Promise<CriterioAvaliacao[]> {
    const response = await this.http.send<unknown>({ method: "GET", path: `${COLLECTION_PATH}/criterios` });
    return criterioAvaliacaoListApiSchema.parse(response.data);
  }
```

`api/ReviewStore.ts`:
- Linha 3, trocar por `import type { CriterioAvaliacao, Review } from "../types/review";`.
- Depois da linha 10, colar `  criterios: () => [...reviewKeys.all, "criterios"] as const,`.
- Depois da linha 26 (o `}` que fecha `listOptions`), colar:

```ts

  criteriosOptions(): UseQueryOptions<CriterioAvaliacao[], Error, CriterioAvaliacao[], ReturnType<typeof reviewKeys.criterios>> {
    return { queryKey: reviewKeys.criterios(), queryFn: () => this.repository.listCriterios() };
  }
```

**Arquivo novo:** `features/reviews/hooks/useCriteriosAvaliacao.ts`

```ts
import { useQuery } from "@tanstack/react-query";

import { reviewStore } from "@/app/container";

export function useCriteriosAvaliacao() {
  return useQuery(reviewStore.criteriosOptions());
}
```

### 8. O select no card — `features/dashboard/components/RentalCard.tsx`

O card não guarda o estado da avaliação: ele recebe tudo pelo prop `review` (`interface ReviewPanel`), e quem controla é o painel.

- Depois da linha 45 (`onCommentChange: (comment: string) => void;`, em `ReviewPanel`), colar:

```tsx
  criterio?: string;
  onCriterioChange?: (criterio: string) => void;
  criterios?: { id: string; nome: string }[];
```

- Depois da linha 377 (o `/>` que fecha o `<textarea>` do comentário), colar:

```tsx
            {review.criterios && (
              <select
                aria-label="Critério da avaliação"
                value={review.criterio ?? ""}
                onChange={(event) => review.onCriterioChange?.(event.target.value)}
                className={PANEL_INPUT}
              >
                <option value="">Critério principal (opcional)</option>
                {review.criterios.map((criterio) => (
                  <option key={criterio.id} value={criterio.id}>{criterio.nome}</option>
                ))}
              </select>
            )}
```

### 9. Os dois painéis

As mesmas 6 alterações nos dois arquivos. A linha muda, a âncora é a mesma:

| Alteração | `DashboardLocatario.tsx` | `DashboardLocador.tsx` | Colar |
| --- | --- | --- | --- |
| Import do hook | depois da 29 | depois da 35 | `import { useCriteriosAvaliacao } from "@/features/reviews/hooks/useCriteriosAvaliacao";` |
| Estado | depois da 141 | depois da 96 | `const [reviewCriterio, setReviewCriterio] = useState("");` |
| Opções | depois da 102 | depois da 108 | `const criteriosQuery = useCriteriosAvaliacao();` |
| Enviar (`createReview.mutateAsync`) | depois da 188 (`rental: rental.id,`) | depois da 255 | `criterio: reviewCriterio \|\| null,` |
| Limpar após enviar | depois da 193 (`setReviewComment("");`) | depois da 260 | `setReviewCriterio("");` |
| Passar ao card (`review={{ ... }}`) | depois da 233 (`onCommentChange: setReviewComment,`) | depois da 322 | as 3 linhas abaixo |

```tsx
        criterio: reviewCriterio,
        onCriterioChange: setReviewCriterio,
        criterios: criteriosQuery.data ?? [],
```

### 10. Exibição — `features/dashboard/components/ReviewsSection.tsx`

| Linha original | Colar |
| --- | --- |
| depois da 14 (`  comment,` na desestruturação de `ReviewCard`) | `  criterio,` |
| depois da 21 (`comment: string \| null \| undefined;`) | `  criterio?: string \| null;` |
| depois da 50 (`<p ...>"{comment}"</p>`) | `      {criterio && <p className="mt-2 text-xs font-bold uppercase tracking-wide text-outline">Critério: {criterio}</p>}` |
| depois da 78 e depois da 97 (`comment={review.comment}`) | `                criterio={review.criterioNome}` |

## Testes que quebram

Sem os ajustes, 19 testes falham (`No QueryClient set` e `No "reviewStore" export`). A linha de mock é sempre esta:

```tsx
vi.mock("@/features/reviews/hooks/useCriteriosAvaliacao", () => ({ useCriteriosAvaliacao: () => ({ data: [] }) }));
```

| Arquivo | Ajuste |
| --- | --- |
| `features/dashboard/tests/tenantDashboard.test.tsx` | Mock antes da linha 11. Na linha 35 (payload esperado), acrescentar `criterio: null` |
| `pages/dashboard/tests/DashboardLocador.test.tsx` | Mock antes da linha 15. Na linha 42 (payload esperado), acrescentar `criterio: null` |

Com os ajustes: 146 testes passam (reviews, dashboard, pages/dashboard, pages/postings).

## Demonstrar

```sql
SELECT id, nome FROM criterios_avaliacao;

SELECT r.comment, r.rating, c.nome
FROM reviews r LEFT JOIN criterios_avaliacao c ON c.id = r.criterio_id
ORDER BY r.created_at DESC LIMIT 3;
```

Para demonstrar:

1. Abra "Minhas Locações" e clique em "Avaliar" numa locação concluída.
2. Escreva o comentário, escolha o critério e clique em "Enviar Avaliação".
3. Abra a aba Avaliações e aperte F5: aparece "Critério: Pontualidade".
