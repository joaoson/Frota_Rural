# CNH — `OperatorLicense`

> **Pedido de exemplo:** "No cadastro da CNH, escolha o tipo de vínculo do motorista (CLT, Autônomo, Diarista) e mostre o vínculo na aba Documentos."

**Telas:** enviar e editar (`/document/cnh` → `pages/documents/CNHUpload.tsx`); exibir na aba Documentos (`features/documents/components/DocumentsSection.tsx`).

**Testado numa cópia limpa:** CNH gravada com o vínculo "CLT" → resposta com `tipo_vinculo_nome: "CLT"` → Documentos mostra "Vínculo: CLT" após F5 → `/document/cnh` abre com "CLT" selecionado e 3 opções.

**Atenção:** numa CNH nova, os campos do formulário só aparecem **depois de enviar a foto** (validação por OCR). Para demonstrar sem a foto, abra a CNH já cadastrada em modo de edição.

Não use "órgão emissor" como exemplo: a CNH já tem o campo de texto `issuing_authority` para isso.

As linhas são do arquivo **original** (commit `0ca8c7e`). Se você também fez o [guia de certificações](certifications.md), os números de `document_validation/*` e `features/documents/*` andam: use as âncoras.

## Backend (`BackEnd/document_validation/`)

### 1. Model — `models.py`

Linha 1: colar `import uuid` e uma linha em branco. Antes da linha 6 (`class OperatorLicense(models.Model):`):

```python
class TipoVinculo(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=60, unique=True)

    class Meta:
        db_table = "tipos_vinculo"
        ordering = ["nome"]

    def __str__(self) -> str:
        return self.nome


```

Depois da linha 58 (`updated_at = ...`, dentro de `OperatorLicense`), antes de `class Meta:` (linha 60):

```python
    tipo_vinculo = models.ForeignKey(TipoVinculo, models.PROTECT, blank=True, null=True)
```

### 2. Migrations

```bash
python manage.py makemigrations document_validation
# 0011_tipovinculo_operatorlicense_tipo_vinculo.py
python manage.py makemigrations document_validation --empty --name tipos_vinculo_iniciais
```

```python
from django.db import migrations

TIPOS_VINCULO = [
    ("8a3dac70-0000-4000-8000-000000000001", "CLT"),
    ("8a3dac70-0000-4000-8000-000000000002", "Autônomo"),
    ("8a3dac70-0000-4000-8000-000000000003", "Diarista"),
]


def inserir_tipos(apps, schema_editor):
    TipoVinculo = apps.get_model("document_validation", "TipoVinculo")
    for id_, nome in TIPOS_VINCULO:
        TipoVinculo.objects.update_or_create(id=id_, defaults={"nome": nome})


def remover_tipos(apps, schema_editor):
    TipoVinculo = apps.get_model("document_validation", "TipoVinculo")
    TipoVinculo.objects.filter(id__in=[id_ for id_, _ in TIPOS_VINCULO]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("document_validation", "0011_tipovinculo_operatorlicense_tipo_vinculo"),
    ]

    operations = [
        migrations.RunPython(inserir_tipos, remover_tipos),
    ]
```

### 3. Serializers — `serializer.py`

| Linha original | Ação |
| --- | --- |
| 6 | Trocar por `from document_validation.models import Certification, OperatorLicense, TipoVinculo` |
| depois da 54 (`"file_url",` em `OperatorLicenseInputSerializer.Meta.fields`) | `"tipo_vinculo",` |
| depois da 111 (`class OperatorLicenseOutputSerializer(...)`) | `    tipo_vinculo_nome = serializers.CharField(source="tipo_vinculo.nome", read_only=True, allow_null=True)` + linha em branco |
| depois da 145 (`"updated_at",` em `OperatorLicenseOutputSerializer.Meta.fields`) | `"tipo_vinculo",` e `"tipo_vinculo_nome",` |
| fim (depois da 231) | serializer do catálogo |

```python


class TipoVinculoOutputSerializer(serializers.ModelSerializer[TipoVinculo]):
    class Meta:
        model = TipoVinculo
        fields = ["id", "nome"]
        read_only_fields = fields
```

**Gravação:** `OperatorLicenseService.create` (`services.py:157`) e `update` (`services.py:176`) usam `serializer.save(...)`. Não mudam.

### 4. Service — `services.py`

Linha 19, trocar por `from document_validation.models import Certification, OperatorLicense, TipoVinculo`. No fim (depois da linha 343):

```python


class TipoVinculoService:
    @staticmethod
    def list() -> QuerySet[TipoVinculo]:
        return TipoVinculo.objects.order_by("nome")
```

### 5. View e rota

`views/licenses.py`:
- Depois da linha 13 (`from document_validation.serializer import (`), colar `    TipoVinculoOutputSerializer,`.
- Linha 19, trocar por `from document_validation.services import OperatorLicenseService, TipoVinculoService`.
- No fim (depois da linha 150), colar:

```python


class TipoVinculoListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Listar tipos de vínculo",
        description="Opções da tabela `tipos_vinculo` usadas no envio da CNH.",
        responses={200: TipoVinculoOutputSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        tipos = TipoVinculoService.list()
        return Response(TipoVinculoOutputSerializer(tipos, many=True).data, status=status.HTTP_200_OK)
```

`views/__init__.py`:
- Depois da linha 10 (`OperatorLicenseReviewView,`, no import), colar `    TipoVinculoListView,`.
- Depois da linha 21 (`"OperatorLicenseReviewView",`), colar `    "TipoVinculoListView",`.

`urls.py`:
- Depois da linha 11 (`OperatorLicenseReviewView,`), colar `    TipoVinculoListView,`.
- Depois da linha 21 (`path("operator-licenses", ...)`), colar:

```python
    path("operator-licenses/tipos-vinculo", TipoVinculoListView.as_view(), name="operator_license_tipos_vinculo"),
```

## Frontend (`FrontEnd/src/features/documents/`)

### 6. Zod, tipos e mapper

`types/documentSchemas.ts`:

| Linha original | Colar |
| --- | --- |
| depois da 55 (`updated_at: ...` em `operatorLicenseApiSchema`) | `tipo_vinculo: z.string().nullish(),` e `tipo_vinculo_nome: z.string().nullish(),` |
| depois da 58 (`export const operatorLicenseListApiSchema = ...`) | `export const tipoVinculoListApiSchema = z.array(z.object({ id: z.string(), nome: z.string() }));` |
| depois da 178 (`}, "A pontuação deve ser entre 0 e 40."),`, em `cnhFormSchema`) | `    tipoVinculo: z.string(),` |

`types/document.ts`:
- Depois da linha 61 (`autoRejectionReasons: string[];`, em `OperatorLicense`), colar `tipoVinculoId?: string | null;` e `tipoVinculoNome?: string | null;`.
- Depois da linha 62 (o `}`), colar:

```ts

export interface TipoVinculo {
  id: string;
  nome: string;
}
```

`api/documentMapper.ts`:

| Linha original | Colar |
| --- | --- |
| depois da 45 (`autoRejectionReasons: ...`, em `licenseToDomain`) | `tipoVinculoId: dto.tipo_vinculo ?? null,` e `tipoVinculoNome: dto.tipo_vinculo_nome ?? null,` |
| depois da 151 (`file_url: fileUrl,`, em `licenseToPayload`) | `tipo_vinculo: values.tipoVinculo \|\| null,` |
| depois da 195 (`points: String(license.points),`, em `licenseToFormValues`) | `tipoVinculo: license.tipoVinculoId ?? "",` |

### 7. Repository, Store e hook

`api/DocumentRepository.ts`:

| Linha original | Ação |
| --- | --- |
| 3 | Acrescentar `TipoVinculo` ao import de tipos |
| depois da 10 (`type ReviewDocumentPayload,`) | `  tipoVinculoListApiSchema,` |
| depois da 40 (`validateCnhFile(...)` na interface) | `  listTiposVinculo(): Promise<TipoVinculo[]>;` |
| depois da 168 (o `}` que fecha `validateCnhFile`), antes do `}` final | método abaixo |

```ts

  async listTiposVinculo(): Promise<TipoVinculo[]> {
    const response = await this.http.send<unknown>({ method: "GET", path: `${LICENSES_PATH}/tipos-vinculo` });
    return tipoVinculoListApiSchema.parse(response.data);
  }
```

`api/DocumentStore.ts`:
- Linha 3: acrescentar `TipoVinculo` ao import.
- Depois da linha 14, colar `  tiposVinculo: () => [...documentKeys.all, "tipos-vinculo"] as const,`.
- Depois da linha 66 (o `}` que fecha `certificationDetailOptions`), colar:

```ts

  tiposVinculoOptions(): UseQueryOptions<TipoVinculo[], Error, TipoVinculo[], ReturnType<typeof documentKeys.tiposVinculo>> {
    return { queryKey: documentKeys.tiposVinculo(), queryFn: () => this.repository.listTiposVinculo() };
  }
```

**Arquivo novo:** `hooks/useTiposVinculo.ts`

```ts
import { useQuery } from "@tanstack/react-query";

import { documentStore } from "@/app/container";

export function useTiposVinculo() {
  return useQuery(documentStore.tiposVinculoOptions());
}
```

### 8. Formulário

`hooks/useDocumentForms.ts`: depois da linha 33 (`points: "0",`, em `CNH_FORM_DEFAULTS`), colar `  tipoVinculo: "",`.

`pages/documents/CNHUpload.tsx` (caminho a partir de `src/`):
- Depois da linha 11 (`import { CNH_FORM_DEFAULTS, useCnhForm } ...`), colar `import { useTiposVinculo } from "@/features/documents/hooks/useTiposVinculo";`.
- Depois da linha 103 (`const form = useCnhForm();`), colar `  const tiposVinculo = useTiposVinculo();`.
- Depois da linha 639 (o `</FormField>` de Observações), antes do botão de envio, colar:

```tsx

              <FormField label="Tipo de Vínculo" error={errors.tipoVinculo?.message}>
                <select
                  className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                  disabled={tiposVinculo.isLoading}
                  {...form.register("tipoVinculo")}
                >
                  <option value="">Selecione o tipo de vínculo</option>
                  {(tiposVinculo.data ?? []).map((tipo) => (
                    <option key={tipo.id} value={tipo.id}>{tipo.nome}</option>
                  ))}
                </select>
              </FormField>
```

O submit da linha 187 já usa `licenseToPayload(values, userId, fileUrl)`, e a edição (linha 118) usa `licenseToFormValues(existingLicense)`. Com o passo 6, os dois levam o campo.

### 9. Exibição — `components/DocumentsSection.tsx`

Depois da linha 104 (o `</p>` com "Categoria … · Validade"), colar:

```tsx
                  <p className="text-xs text-outline font-medium uppercase tracking-wide">
                    Vínculo: {lic.tipoVinculoNome ?? "Não informado"}
                  </p>
```

## Testes que quebram

| Arquivo | Ajuste |
| --- | --- |
| `pages/documents/tests/CNHUpload.test.tsx` | Antes da linha 11: `vi.mock("@/features/documents/hooks/useTiposVinculo", () => ({ useTiposVinculo: () => ({ data: [], isLoading: false }) }));` |

Sem o mock, o teste "reports a validation outage..." falha, porque passa a ver 2 chamadas HTTP em vez de 1. Com ele, 219 testes passam (documents, pages/documents, dashboards, admin).

## Demonstrar

```sql
SELECT id, nome FROM tipos_vinculo;

SELECT l.name, l.cnh_number, t.nome
FROM operator_licenses l LEFT JOIN tipos_vinculo t ON t.id = l.tipo_vinculo_id;
```

Para demonstrar:

1. Abra `/document/cnh` com uma CNH já cadastrada (modo edição), escolha o vínculo e salve.
2. Abra Documentos e aperte F5: aparece "Vínculo: …".
3. Volte em `/document/cnh`: o select vem preenchido.
