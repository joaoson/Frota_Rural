# Certificações — `Certification`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/document_validation/models.py:89` — dentro de `Certification`, imediatamente antes de `class Meta`, inserir:

```python
categoria_autoria = models.ForeignKey(
    "autoria.Genero", on_delete=models.PROTECT,
    null=True, blank=True, related_name="+",
)
```

```bash
# Terminal em BackEnd/
source .venv/bin/activate
source ../Devops/autoria.env.sh
python manage.py verify_database
# Esperado: 127.0.0.1:5442 / frota_rural_autoria
python manage.py makemigrations document_validation
python manage.py migrate --plan
python manage.py migrate
```

## 2 Entrada no serializer usado pelo service

`BackEnd/document_validation/serializer.py:58` — procurar `class CertificationInputSerializer`. Em `CertificationInputSerializer.Meta.fields`, acrescentar `"categoria_autoria"` antes do fechamento da lista. Manter todos os campos e validações existentes.

## 3 Service existente

`BackEnd/document_validation/services.py:231` — procurar `class CertificationService`. `CertificationService.create` e `CertificationService.update` já usam `CertificationInputSerializer` e `serializer.save()`. A nova FK entra em `validated_data`; não criar outro service.

Trecho atual do método de atualização (referência, não substituir):

```python
def update(
    certification_id: UUID, data: Mapping[str, Any], *, actor: Users, partial: bool = False
) -> Certification:
    """Qualquer edição invalida a análise anterior: volta para `pending`."""
    certification = CertificationService.get(certification_id, actor=actor)
    serializer = CertificationInputSerializer(certification, data=data, partial=partial, context={"actor": actor})
    serializer.is_valid(raise_exception=True)
    try:
        return serializer.save(
            validation_status=ValidationStatus.PENDING,
            review_note=None,
            updated_at=timezone.now(),
        )
    except IntegrityError as exc:
        raise Conflict("Dados em conflito com um registro existente.") from exc
```

## 4 Saída existente

`BackEnd/document_validation/serializer.py:150` — procurar `class CertificationOutputSerializer`. Entre a abertura da classe e `class Meta`, acrescentar:

```python
categoria_nome = serializers.CharField(
    source="categoria_autoria.Genero", read_only=True, allow_null=True, default=None,
)
```
Em `CertificationOutputSerializer.Meta.fields`, acrescentar ao final da lista:

```python
"categoria_autoria",
"categoria_nome",
```

Para listas que exibem o nome, acrescentar `"categoria_autoria"` ao `select_related` do queryset utilizado; preservar os filtros de acesso.

## 5 Frontend existente

Aplicar os campos do [guia 02, passo 3](../02_frontend_repository_store_componente.md#3-contrato-de-dados-no-fluxo-existente) nestes pontos:

| Alteração | Arquivo e âncora |
| --- | --- |
| Resposta Zod | `FrontEnd/src/features/documents/types/documentSchemas.ts:60` — procurar `export const certificationApiSchema` |
| Tipo de domínio | `FrontEnd/src/features/documents/types/document.ts:64` — procurar `export interface Certification` |
| Mapper de leitura | `FrontEnd/src/features/documents/api/documentMapper.ts:49` — procurar `export function certificationToDomain` |
| Entrada/payload | `FrontEnd/src/features/documents/api/DocumentRepository.ts:109` — procurar `async createCertification` |


`features/documents/hooks/useDocumentForms.ts` e `components/DocumentsSection.tsx` já controlam os formulários. `DocumentRepository.createCertification`/`updateCertification` recebem `Record<string, unknown>`: acrescentar `categoria_autoria` ao objeto realmente enviado, não só ao tipo de domínio.

1. Acrescentar `categoriaId: z.string().optional()` ao schema do formulário correspondente em `documentSchemas.ts`.
2. No mapper de formulário em `documentMapper.ts`, carregar `categoriaId` do documento; no mapper de envio, incluir `categoria_autoria: values.categoriaId || null`.
3. Inserir `CategoriaSelect` no formulário da CNH/certificação, ligado a `watch`/`setValue` da instância desse formulário.
4. No cartão persistido de `DocumentsSection`, exibir o `categoriaNome` do documento retornado pelo backend.

Endpoints: `/api/certifications` e `/api/certifications/<id>`.


Toda edição pelo service atual volta o documento para análise. A categoria nova não substitui `validation_status` nem, na CNH, a categoria de habilitação A/B/C/D/E.

## 6 Comprovar

Salvar pelo formulário indicado, consultar a FK no banco e recarregar a mesma tela. Aplicar os casos de ID inexistente/permissão do [guia 03](../03_validacao_e_erros.md).
