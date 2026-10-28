# CNHs — `OperatorLicense`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/document_validation/models.py:60` — dentro de `OperatorLicense`, imediatamente antes de `class Meta`, inserir:

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

`BackEnd/document_validation/serializer.py:22` — procurar `class OperatorLicenseInputSerializer`. Em `OperatorLicenseInputSerializer.Meta.fields`, acrescentar `"categoria_autoria"` antes do fechamento da lista. Manter todos os campos e validações existentes.

## 3 Service existente

`BackEnd/document_validation/services.py:144` — procurar `class OperatorLicenseService`. `OperatorLicenseService.create` e `OperatorLicenseService.update` já usam `OperatorLicenseInputSerializer` e `serializer.save()`. A nova FK entra em `validated_data`; não criar outro service.

Trecho atual do método de atualização (referência, não substituir):

```python
def update(
    license_id: UUID, data: Mapping[str, Any], *, actor: Users, partial: bool = False
) -> OperatorLicense:
    """Qualquer edição invalida a análise anterior: a CNH volta para `pending`.

    Depois disso os dados são reavaliados pelo modelo de plausibilidade, então uma
    edição corrigida sai da recusa automática e uma ainda suspeita volta a ela.
    """
    license_ = OperatorLicenseService.get(license_id, actor=actor)
    serializer = OperatorLicenseInputSerializer(
        license_, data=data, partial=partial, context={"actor": actor}
    )
    serializer.is_valid(raise_exception=True)
    try:
        license_ = serializer.save(
            validation_status=ValidationStatus.PENDING,
            review_note=None,
            auto_rejected=False,
            veracity_score=None,
            auto_rejection_reasons=[],
            updated_at=timezone.now(),
        )
    except IntegrityError as exc:
        raise Conflict("Dados em conflito com um registro existente.") from exc
    _screen_license(license_)
    return license_
```

## 4 Saída existente

`BackEnd/document_validation/serializer.py:111` — procurar `class OperatorLicenseOutputSerializer`. Entre a abertura da classe e `class Meta`, acrescentar:

```python
categoria_nome = serializers.CharField(
    source="categoria_autoria.Genero", read_only=True, allow_null=True, default=None,
)
```
Em `OperatorLicenseOutputSerializer.Meta.fields`, acrescentar ao final da lista:

```python
"categoria_autoria",
"categoria_nome",
```

Para listas que exibem o nome, acrescentar `"categoria_autoria"` ao `select_related` do queryset utilizado; preservar os filtros de acesso.

## 5 Frontend existente

Aplicar os campos do [guia 02, passo 3](../02_frontend_repository_store_componente.md#3-contrato-de-dados-no-fluxo-existente) nestes pontos:

| Alteração | Arquivo e âncora |
| --- | --- |
| Resposta Zod | `FrontEnd/src/features/documents/types/documentSchemas.ts:24` — procurar `export const operatorLicenseApiSchema` |
| Tipo de domínio | `FrontEnd/src/features/documents/types/document.ts:33` — procurar `export interface OperatorLicense` |
| Mapper de leitura | `FrontEnd/src/features/documents/api/documentMapper.ts:14` — procurar `export function licenseToDomain` |
| Entrada/payload | `FrontEnd/src/features/documents/api/DocumentRepository.ts:63` — procurar `async createLicense` |


`features/documents/hooks/useDocumentForms.ts` e `components/DocumentsSection.tsx` já controlam os formulários. `DocumentRepository.createLicense`/`updateLicense` recebem `Record<string, unknown>`: acrescentar `categoria_autoria` ao objeto realmente enviado, não só ao tipo de domínio.

1. Acrescentar `categoriaId: z.string().optional()` ao schema do formulário correspondente em `documentSchemas.ts`.
2. No mapper de formulário em `documentMapper.ts`, carregar `categoriaId` do documento; no mapper de envio, incluir `categoria_autoria: values.categoriaId || null`.
3. Inserir `CategoriaSelect` no formulário da CNH/certificação, ligado a `watch`/`setValue` da instância desse formulário.
4. No cartão persistido de `DocumentsSection`, exibir o `categoriaNome` do documento retornado pelo backend.

Endpoints: `/api/operator-licenses` e `/api/operator-licenses/<id>`.


Toda edição pelo service atual volta o documento para análise. A categoria nova não substitui `validation_status` nem, na CNH, a categoria de habilitação A/B/C/D/E.

## 6 Comprovar

Salvar pelo formulário indicado, consultar a FK no banco e recarregar a mesma tela. Aplicar os casos de ID inexistente/permissão do [guia 03](../03_validacao_e_erros.md).
