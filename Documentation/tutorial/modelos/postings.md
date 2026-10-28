# Anúncios — `Postings`

> **Pedido de exemplo:** "No cadastro de anúncio, adicione a modalidade de entrega com 3 opções e mostre a modalidade na página do anúncio."

**Telas:** criar (`/dashboard/novo-anuncio` → `NovoAnuncio.tsx`), editar (`/dashboard/gerenciar-anuncio/<id>` → `GerenciarAnuncio.tsx`) e exibir (`/anuncio/<id>` → `AnuncioDetalhe.tsx`).

**Testado numa cópia limpa:** migrations aplicadas; o select aparece com 3 opções; a edição salva; o detalhe mostra "Entrega pelo locador" após F5.

O raciocínio de cada passo está no [exemplo completo de máquina](../02_exemplo_maquina_tipo_pneu.md). Aqui ficam só os pontos de mudança. As linhas são do arquivo **original**; se você já colou algo antes, procure pela âncora.

## Mapa

| # | Arquivo | Onde | O que |
| --- | --- | --- | --- |
| 1 | `BackEnd/postings/models.py` | linha 1, depois da 5 e depois da 23 | `ModalidadeEntrega` + FK `modalidade_entrega` |
| 2 | `BackEnd/postings/migrations/` | comandos | schema + 3 registros |
| 3 | `BackEnd/postings/serializer.py` | linhas 13, 55, 218, 240 e fim | entrada, saída do detalhe e catálogo |
| 4 | `BackEnd/postings/services.py` | linha 17 e fim | `ModalidadeEntregaService` |
| 5 | `BackEnd/postings/views/postings.py`, `views/__init__.py`, `urls.py` | — | `GET /api/postings/modalidades-entrega` |
| 6 | `features/postings/types/posting.ts`, `postingSchemas.ts` | — | tipos e Zod |
| 7 | `features/postings/api/postingMapper.ts` | 70, 90, 106 | ler e enviar |
| 8 | `PostingRepository.ts`, `PostingStore.ts`, hook novo | — | buscar as opções |
| 9 | `features/postings/hooks/usePostingForm.ts` | 18 e 43 | valor inicial |
| 10 | `pages/postings/NovoAnuncio.tsx` | 18, 46, 256 | select na criação |
| 11 | `pages/postings/GerenciarAnuncio.tsx` | 23, 57, 90, 238 | select na edição |
| 12 | `pages/public/AnuncioDetalhe.tsx` | 378 | exibir |

## Backend

### 1. Model — `BackEnd/postings/models.py`

Linha 1, antes de `from django.db import models`, colar `import uuid` e uma linha em branco.

Depois da linha 5, antes de `class Postings(models.Model):`, colar:

```python
class ModalidadeEntrega(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=60, unique=True)

    class Meta:
        db_table = "modalidades_entrega"
        ordering = ["nome"]

    def __str__(self) -> str:
        return self.nome


```

Depois da linha 23 (`updated_at = models.DateTimeField(blank=True, null=True)`), antes de `class Meta:`, colar:

```python
    modalidade_entrega = models.ForeignKey(ModalidadeEntrega, models.PROTECT, blank=True, null=True)
```

### 2. Migrations

```bash
python manage.py makemigrations postings
# 0006_modalidadeentrega_postings_modalidade_entrega.py
python manage.py makemigrations postings --empty --name modalidades_entrega_iniciais
# 0007_modalidades_entrega_iniciais.py
```

Conteúdo inteiro de `0007_modalidades_entrega_iniciais.py`. Confira se o nome em `dependencies` é o do arquivo gerado no primeiro comando:

```python
from django.db import migrations

MODALIDADES = [
    ("2a7d4c10-0000-4000-8000-000000000001", "Retirada no local"),
    ("2a7d4c10-0000-4000-8000-000000000002", "Entrega pelo locador"),
    ("2a7d4c10-0000-4000-8000-000000000003", "Entrega a combinar"),
]


def inserir_modalidades(apps, schema_editor):
    ModalidadeEntrega = apps.get_model("postings", "ModalidadeEntrega")
    for id_, nome in MODALIDADES:
        ModalidadeEntrega.objects.update_or_create(id=id_, defaults={"nome": nome})


def remover_modalidades(apps, schema_editor):
    ModalidadeEntrega = apps.get_model("postings", "ModalidadeEntrega")
    ModalidadeEntrega.objects.filter(id__in=[id_ for id_, _ in MODALIDADES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("postings", "0006_modalidadeentrega_postings_modalidade_entrega"),
    ]

    operations = [
        migrations.RunPython(inserir_modalidades, remover_modalidades),
    ]
```

```bash
python manage.py migrate
```

### 3. Serializers — `BackEnd/postings/serializer.py`

| Linha original | Ação |
| --- | --- |
| 13 | Trocar por `from postings.models import ModalidadeEntrega, Postings, PostingsPhotos` |
| depois da 55 (`"status",` em `PostingInputSerializer.Meta.fields`) | `"modalidade_entrega",` |
| depois da 218 (`photos = serializers.SerializerMethodField()`, dentro de `PostingDetailOutputSerializer`) | bloco abaixo |
| depois da 240 (`"photos",` em `PostingDetailOutputSerializer.Meta.fields`) | `"modalidade_entrega",` e `"modalidade_entrega_nome",` |
| fim do arquivo (depois da 305) | serializer do catálogo |

```python
    modalidade_entrega_nome = serializers.CharField(
        source="modalidade_entrega.nome", read_only=True, allow_null=True
    )
```

```python


class ModalidadeEntregaOutputSerializer(serializers.ModelSerializer[ModalidadeEntrega]):
    class Meta:
        model = ModalidadeEntrega
        fields = ["id", "nome"]
        read_only_fields = fields
```

`PostingService.create` (linha 90) e `update` (linha 110) já usam `PostingInputSerializer` + `serializer.save()`: não mudam. Este anúncio tem três serializers de saída. Só o de **detalhe** precisa do campo, porque ele alimenta a página do anúncio e o carregamento da edição.

### 4. Service — `BackEnd/postings/services.py`

Linha 17, trocar por `from postings.models import ModalidadeEntrega, Postings, PostingsPhotos`. No fim do arquivo (depois da linha 186), colar:

```python


class ModalidadeEntregaService:
    @staticmethod
    def list() -> QuerySet[ModalidadeEntrega]:
        return ModalidadeEntrega.objects.order_by("nome")
```

### 5. View e rota

`BackEnd/postings/views/postings.py`:

- Depois da linha 12 (`from postings.serializer import (`), colar `    ModalidadeEntregaOutputSerializer,`.
- Linha 19, trocar por `from postings.services import ModalidadeEntregaService, PostingService`.
- No fim (depois da linha 128), colar:

```python


class ModalidadeEntregaListView(APIView):
    permission_classes = [IsAuthenticatedOrReadOnly]

    @extend_schema(
        tags=TAGS,
        summary="Listar modalidades de entrega",
        description="Opções da tabela `modalidades_entrega` usadas no cadastro de anúncios.",
        responses={200: ModalidadeEntregaOutputSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        modalidades = ModalidadeEntregaService.list()
        return Response(ModalidadeEntregaOutputSerializer(modalidades, many=True).data, status=status.HTTP_200_OK)
```

`BackEnd/postings/views/__init__.py`, trocar as linhas 2 e 4:

```python
from postings.views.postings import ModalidadeEntregaListView, PostingDetailView, PostingListView

__all__ = ["ModalidadeEntregaListView", "PostingDetailView", "PostingListView", "PostingPhotoUploadView"]
```

`BackEnd/postings/urls.py`:

- Linha 3, trocar por `from postings.views import ModalidadeEntregaListView, PostingDetailView, PostingListView, PostingPhotoUploadView`.
- Depois da linha 10, colar:

```python
    path("postings/modalidades-entrega", ModalidadeEntregaListView.as_view(), name="posting_modalidades_entrega"),
```

## Frontend (`FrontEnd/src/`)

### 6. Tipos — `features/postings/types/posting.ts`

Depois da linha 41 (`photos: PostingPhoto[];`, dentro de `PostingDetail`):

```ts
  modalidadeEntregaId: string | null;
  modalidadeEntregaNome: string | null;
```

Depois da linha 42 (o `}` que fecha `PostingDetail`):

```ts

export interface ModalidadeEntrega {
  id: string;
  nome: string;
}
```

### 6b. Zod — `features/postings/types/postingSchemas.ts`

| Linha original | Colar |
| --- | --- |
| depois da 55 (`photos: z.array(...)`, em `postingDetailApiSchema`) | `modalidade_entrega: z.string().nullish(),` e `modalidade_entrega_nome: z.string().nullish(),` |
| depois da 57 (`export type PostingDetailApi = ...`) | bloco abaixo |
| depois da 93 (`description: z.string().trim(),` em `postingFormSchema`) | `modalidadeEntrega: z.string(),` |
| depois da 122 (`description: z.string().trim(),` em `postingEditFormSchema`) | `modalidadeEntrega: z.string(),` |
| depois da 150 (`status?: string;` em `PostingWritePayload`) | `modalidade_entrega?: string \| null;` |

```ts

export const modalidadeEntregaListApiSchema = z.array(
  z.object({ id: z.string(), nome: z.string() }),
);
```

### 7. Mapper — `features/postings/api/postingMapper.ts`

| Linha original | Colar |
| --- | --- |
| depois da 70 (`photos,` em `detailToDomain`) | `modalidadeEntregaId: dto.modalidade_entrega ?? null,` e `modalidadeEntregaNome: dto.modalidade_entrega_nome ?? null,` |
| depois da 90 (`description: values.description,` em `toWritePayload`) | `modalidade_entrega: values.modalidadeEntrega \|\| null,` |
| depois da 106 (`description: values.description,` em `toEditPayload`) | `modalidade_entrega: values.modalidadeEntrega \|\| null,` |

### 8. Buscar as opções

`features/postings/api/PostingRepository.ts`:

| Linha original | Colar |
| --- | --- |
| depois da 4 (`import type {`) | `  ModalidadeEntrega,` |
| depois da 10 (`import {`) | `  modalidadeEntregaListApiSchema,` |
| depois da 36 (`uploadPhotos(...)` na `interface PostingRepository`) | `  listModalidadesEntrega(): Promise<ModalidadeEntrega[]>;` |
| depois da 144 (o `}` que fecha `uploadPhotos`), no lugar da linha em branco 145 | método abaixo |

```ts

  async listModalidadesEntrega(): Promise<ModalidadeEntrega[]> {
    const response = await this.http.send<unknown>({ method: "GET", path: `${COLLECTION_PATH}/modalidades-entrega` });
    return modalidadeEntregaListApiSchema.parse(response.data);
  }
```

`features/postings/api/PostingStore.ts`:

| Linha original | Colar |
| --- | --- |
| depois da 3 (`import type {`) | `  ModalidadeEntrega,` |
| depois da 16 (`detail: (id: string) => ...`) | `  modalidadesEntrega: () => [...postingKeys.all, "modalidades-entrega"] as const,` |
| depois da 43 (o `}` que fecha `detailOptions`) | método abaixo |

```ts

  modalidadesEntregaOptions(): UseQueryOptions<ModalidadeEntrega[], Error, ModalidadeEntrega[], ReturnType<typeof postingKeys.modalidadesEntrega>> {
    return { queryKey: postingKeys.modalidadesEntrega(), queryFn: () => this.repository.listModalidadesEntrega() };
  }
```

**Arquivo novo:** `features/postings/hooks/useModalidadesEntrega.ts`

```ts
import { useQuery } from "@tanstack/react-query";

import { postingStore } from "@/app/container";

export function useModalidadesEntrega() {
  return useQuery(postingStore.modalidadesEntregaOptions());
}
```

O hook vai num arquivo próprio, e não em `usePostings.ts`, porque os testes mockam `usePostings.ts` inteiro. Uma função nova lá dentro quebraria esses mocks.

### 9. Valor inicial — `features/postings/hooks/usePostingForm.ts`

Depois da linha 18 e depois da linha 43 (ambas `description: "",`), colar `modalidadeEntrega: "",`.

### 10. Criação — `pages/postings/NovoAnuncio.tsx`

- Depois da linha 18 (`import { usePostingForm } ...`), colar `import { useModalidadesEntrega } from "@/features/postings/hooks/useModalidadesEntrega";`.
- Depois da linha 46 (`const uploadPhotos = useUploadPostingPhotos();`), colar `const modalidades = useModalidadesEntrega();`.
- Depois da linha 256 (o `</FormField>` da Descrição), antes de `<FormField label="Fotos do Anúncio (Opcional)"`, colar:

```tsx

        <FormField label="Modalidade de Entrega" error={errors.modalidadeEntrega?.message}>
          <select
            className={inputClass(Boolean(errors.modalidadeEntrega))}
            disabled={modalidades.isLoading}
            {...form.register("modalidadeEntrega")}
          >
            <option value="">Selecione a modalidade de entrega</option>
            {(modalidades.data ?? []).map((modalidade) => (
              <option key={modalidade.id} value={modalidade.id}>{modalidade.nome}</option>
            ))}
          </select>
        </FormField>
```

O submit da linha 85 já usa `toWritePayload(values, coordenadas)`: o ID vai junto.

### 11. Edição — `pages/postings/GerenciarAnuncio.tsx`

- Depois da linha 23 (`import { usePostingEditForm } ...`), colar o mesmo import do hook.
- Depois da linha 57 (`const deletePosting = useDeletePosting();`), colar `const modalidades = useModalidadesEntrega();`.
- Depois da linha 90 (`description: posting.description ?? "",` dentro de `form.reset`), colar `modalidadeEntrega: posting.modalidadeEntregaId ?? "",`. É isto que carrega o valor salvo quando a tela abre.
- Depois da linha 238 (o `</FormField>` da Descrição), antes do `<div className="pt-4 border-t ...">` dos botões, colar:

```tsx

            <FormField label="Modalidade de Entrega" error={errors.modalidadeEntrega?.message}>
              <select
                className={inputClass(Boolean(errors.modalidadeEntrega))}
                disabled={modalidades.isLoading}
                {...form.register("modalidadeEntrega")}
              >
                <option value="">Não informada</option>
                {(modalidades.data ?? []).map((modalidade) => (
                  <option key={modalidade.id} value={modalidade.id}>{modalidade.nome}</option>
                ))}
              </select>
            </FormField>
```

### 12. Exibição — `pages/public/AnuncioDetalhe.tsx`

Depois da linha 378 (`{ label: "Nº Renagro", valor: anuncio.machineRenagroNumber },`), colar:

```tsx
                    { label: "Entrega", valor: anuncio.modalidadeEntregaNome },
```

A ficha técnica só mostra itens com valor. Anúncios sem modalidade continuam iguais.

## Testes que quebram

| Arquivo | Ajuste |
| --- | --- |
| `features/postings/tests/postingData.test.tsx`, linha 19 (`const form = {...}`) | Acrescentar `modalidadeEntrega: ""` ao objeto, senão o `tsc` falha |
| `pages/postings/tests/NovoAnuncio.test.tsx`, depois da linha 9 | `vi.mock("@/features/postings/hooks/useModalidadesEntrega", () => ({ useModalidadesEntrega: () => ({ data: [], isLoading: false }) }));` |
| `pages/postings/tests/GerenciarAnuncio.test.tsx`, depois da linha 9 | o mesmo `vi.mock` |

Sem os mocks, 4 testes falham com `No QueryClient set`: essas telas são renderizadas sem React Query. Com eles, 88 testes passam.

## Demonstrar

```sql
SELECT id, nome FROM modalidades_entrega;

SELECT p.id, m.nome
FROM postings p JOIN modalidades_entrega m ON m.id = p.modalidade_entrega_id;
```

Para demonstrar:

1. Edite um anúncio em "Gerenciar anúncio" e salve.
2. Abra `/anuncio/<id>` e aperte F5: a ficha mostra "Entrega: …".
3. Abra de novo a edição: o select já vem com o valor salvo.
