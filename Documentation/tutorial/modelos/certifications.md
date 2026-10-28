# Certificações — `Certification`

> **Pedido de exemplo:** "No envio de certificação, escolha a área (Operação de máquinas, Segurança do trabalho (NR-31), Manutenção mecânica) e mostre a área na lista de documentos."

**Telas:** enviar e editar (`/document/certification` e `/document/certification/<id>` → `pages/documents/CertificationUpload.tsx`); exibir na aba Documentos (`features/documents/components/DocumentsSection.tsx`).

**Testado numa cópia limpa:** enviar com "Segurança do trabalho (NR-31)" → `POST /api/certifications` devolve `area_nome` → Documentos mostra "Área: Segurança do trabalho (NR-31)" após F5.

As linhas são do arquivo **original** (commit `0ca8c7e`). CNH e certificação moram no mesmo app (`document_validation`) e nos mesmos arquivos de frontend. Se você fizer os dois guias, os números andam: use as âncoras.

## Backend (`BackEnd/document_validation/`)

### 1. Model — `models.py`

Linha 1: colar `import uuid` e uma linha em branco antes de `from django.db import models`. Antes da linha 67 (`class Certification(models.Model):`):

```python
class AreaCertificacao(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=60, unique=True)

    class Meta:
        db_table = "areas_certificacao"
        ordering = ["nome"]

    def __str__(self) -> str:
        return self.nome


```

Depois da linha 87 (`updated_at = ...`, dentro de `Certification`), antes de `class Meta:`:

```python
    area = models.ForeignKey(AreaCertificacao, models.PROTECT, blank=True, null=True)
```

### 2. Migrations

```bash
python manage.py makemigrations document_validation
# 0011_areacertificacao_certification_area.py
python manage.py makemigrations document_validation --empty --name areas_certificacao_iniciais
# 0012_areas_certificacao_iniciais.py
```

```python
from django.db import migrations

AREAS = [
    ("7f2c9b60-0000-4000-8000-000000000001", "Operação de máquinas"),
    ("7f2c9b60-0000-4000-8000-000000000002", "Segurança do trabalho (NR-31)"),
    ("7f2c9b60-0000-4000-8000-000000000003", "Manutenção mecânica"),
]


def inserir_areas(apps, schema_editor):
    AreaCertificacao = apps.get_model("document_validation", "AreaCertificacao")
    for id_, nome in AREAS:
        AreaCertificacao.objects.update_or_create(id=id_, defaults={"nome": nome})


def remover_areas(apps, schema_editor):
    AreaCertificacao = apps.get_model("document_validation", "AreaCertificacao")
    AreaCertificacao.objects.filter(id__in=[id_ for id_, _ in AREAS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("document_validation", "0011_areacertificacao_certification_area"),
    ]

    operations = [
        migrations.RunPython(inserir_areas, remover_areas),
    ]
```

### 3. Serializers — `serializer.py`

| Linha original | Ação |
| --- | --- |
| 6 | Trocar por `from document_validation.models import AreaCertificacao, Certification, OperatorLicense` |
| depois da 71 (`"media_url",` em `CertificationInputSerializer.Meta.fields`) | `"area",` |
| depois da 150 (`class CertificationOutputSerializer(...)`) | `    area_nome = serializers.CharField(source="area.nome", read_only=True, allow_null=True)` + linha em branco |
| depois da 166 (`"updated_at",` em `CertificationOutputSerializer.Meta.fields`) | `"area",` e `"area_nome",` |
| fim (depois da 231) | serializer do catálogo |

```python


class AreaCertificacaoOutputSerializer(serializers.ModelSerializer[AreaCertificacao]):
    class Meta:
        model = AreaCertificacao
        fields = ["id", "nome"]
        read_only_fields = fields
```

**Gravação:** `CertificationService.create` (`services.py:244`) e `update` (`services.py:261`) usam `serializer.save(...)`. Não mudam.

### 4. Service — `services.py`

Linha 19, trocar por `from document_validation.models import AreaCertificacao, Certification, OperatorLicense`. No fim (depois da linha 343):

```python


class AreaCertificacaoService:
    @staticmethod
    def list() -> QuerySet[AreaCertificacao]:
        return AreaCertificacao.objects.order_by("nome")
```

### 5. View e rota

`views/certifications.py`:
- Depois da linha 13 (`from document_validation.serializer import (`), colar `    AreaCertificacaoOutputSerializer,`.
- Linha 19, trocar por `from document_validation.services import AreaCertificacaoService, CertificationService`.
- No fim (depois da linha 134), colar:

```python


class AreaCertificacaoListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Listar áreas de certificação",
        description="Opções da tabela `areas_certificacao` usadas no envio de certificações.",
        responses={200: AreaCertificacaoOutputSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        areas = AreaCertificacaoService.list()
        return Response(AreaCertificacaoOutputSerializer(areas, many=True).data, status=status.HTTP_200_OK)
```

`views/__init__.py`:
- Depois da linha 1 (`from document_validation.views.certifications import (`), colar `    AreaCertificacaoListView,`.
- Depois da linha 13 (`__all__ = [`), colar `    "AreaCertificacaoListView",`.

`urls.py`:
- Depois da linha 3 (`from document_validation.views import (`), colar `    AreaCertificacaoListView,`.
- Depois da linha 32 (`path("certifications", ...)`), colar:

```python
    path("certifications/areas", AreaCertificacaoListView.as_view(), name="certification_areas"),
```

## Frontend (`FrontEnd/src/features/documents/`)

### 6. Zod, tipos e mapper

`types/documentSchemas.ts`:

| Linha original | Colar |
| --- | --- |
| depois da 73 (`updated_at: ...` em `certificationApiSchema`) | `area: z.string().nullish(),` e `area_nome: z.string().nullish(),` |
| depois da 76 (`export const certificationListApiSchema = ...`) | `export const areaCertificacaoListApiSchema = z.array(z.object({ id: z.string(), nome: z.string() }));` |
| depois da 216 (`.min(10, "A descrição deve conter ...")`, em `certificationFormSchema`) | `    area: z.string(),` |

`types/document.ts`:
- Depois da linha 71 (`mediaUrl: string | null;`, em `Certification`), colar `areaId?: string | null;` e `areaNome?: string | null;`.
- Depois da linha 72 (o `}`), colar:

```ts

export interface AreaCertificacao {
  id: string;
  nome: string;
}
```

`api/documentMapper.ts`:

| Linha original | Colar |
| --- | --- |
| depois da 62 (`mediaUrl: dto.media_url ?? null,`, em `certificationToDomain`) | `areaId: dto.area ?? null,` e `areaNome: dto.area_nome ?? null,` |
| depois da 168 (`media_url: mediaUrl,`, em `certificationToPayload`) | `area: values.area \|\| null,` |
| depois da 208 (`description: certification.description,`, em `certificationToFormValues`) | `area: certification.areaId ?? "",` (preenche a edição) |

### 7. Repository, Store e hook

`api/DocumentRepository.ts`:

| Linha original | Ação |
| --- | --- |
| 3 | Acrescentar `AreaCertificacao` ao import de tipos |
| depois da 4 (`import {`) | `  areaCertificacaoListApiSchema,` |
| depois da 40 (`validateCnhFile(...)` na interface) | `  listAreasCertificacao(): Promise<AreaCertificacao[]>;` |
| depois da 168 (o `}` que fecha `validateCnhFile`), antes do `}` final | método abaixo |

```ts

  async listAreasCertificacao(): Promise<AreaCertificacao[]> {
    const response = await this.http.send<unknown>({ method: "GET", path: `${CERTIFICATIONS_PATH}/areas` });
    return areaCertificacaoListApiSchema.parse(response.data);
  }
```

`api/DocumentStore.ts`:
- Linha 3: acrescentar `AreaCertificacao` ao import.
- Depois da linha 14 (`certificationDetail: ...`), colar `  areasCertificacao: () => [...documentKeys.all, "areas-certificacao"] as const,`.
- Depois da linha 66 (o `}` que fecha `certificationDetailOptions`), colar:

```ts

  areasCertificacaoOptions(): UseQueryOptions<AreaCertificacao[], Error, AreaCertificacao[], ReturnType<typeof documentKeys.areasCertificacao>> {
    return { queryKey: documentKeys.areasCertificacao(), queryFn: () => this.repository.listAreasCertificacao() };
  }
```

**Arquivo novo:** `hooks/useAreasCertificacao.ts`

```ts
import { useQuery } from "@tanstack/react-query";

import { documentStore } from "@/app/container";

export function useAreasCertificacao() {
  return useQuery(documentStore.areasCertificacaoOptions());
}
```

### 8. Formulário

`hooks/useDocumentForms.ts`: depois da linha 50 (`description: "",`, em `CERTIFICATION_FORM_DEFAULTS`), colar `  area: "",`.

`pages/documents/CertificationUpload.tsx` (caminho a partir de `src/`):
- Depois da linha 13 (`import { useCertificationForm } ...`), colar `import { useAreasCertificacao } from "@/features/documents/hooks/useAreasCertificacao";`.
- Depois da linha 52 (`const form = useCertificationForm();`), colar `  const areas = useAreasCertificacao();`.
- Depois da linha 184 (o `</FormField>` da Descrição), colar:

```tsx

            <FormField label="Área da Certificação" error={errors.area?.message}>
              <select
                className={inputClass(Boolean(errors.area))}
                disabled={areas.isLoading}
                {...form.register("area")}
              >
                <option value="">Selecione a área</option>
                {(areas.data ?? []).map((area) => (
                  <option key={area.id} value={area.id}>{area.nome}</option>
                ))}
              </select>
            </FormField>
```

A edição já chama `form.reset(certificationToFormValues(certification))` na linha 62. Com o passo 6, o valor salvo vem junto.

### 9. Exibição — `components/DocumentsSection.tsx`

Depois da linha 232 (o `</p>` com organização e data, no card da certificação), colar:

```tsx
                  <p className="text-xs text-outline font-medium uppercase tracking-wide">
                    Área: {cert.areaNome ?? "Não informada"}
                  </p>
```

## Testes que quebram

| Arquivo | Ajuste |
| --- | --- |
| `features/documents/tests/documentData.test.tsx`, linha 167 (`const base = {...}`) | Acrescentar `area: ""` |
| `pages/documents/tests/CertificationUpload.test.tsx` | Antes da linha 8: `vi.mock("@/features/documents/hooks/useAreasCertificacao", () => ({ useAreasCertificacao: () => ({ data: [], isLoading: false }) }));` |

Sem os ajustes, 6 testes falham. Com eles, 189 passam (documents, pages/documents, dashboards).

## Demonstrar

```sql
SELECT id, nome FROM areas_certificacao;

SELECT c.title, c.area_id, a.nome
FROM certifications c LEFT JOIN areas_certificacao a ON a.id = c.area_id
ORDER BY c.created_at DESC LIMIT 3;
```

Para demonstrar:

1. Abra `/document/certification`, preencha os campos, escolha a área e envie.
2. Abra Documentos e aperte F5: aparece "Área: …".
3. Clique em "Editar" na certificação: o select vem preenchido.
