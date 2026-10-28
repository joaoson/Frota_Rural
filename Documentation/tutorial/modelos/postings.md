# Anúncios — `Postings`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/postings/models.py:25` — dentro de `Postings`, imediatamente antes de `class Meta`, inserir:

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
python manage.py makemigrations postings
python manage.py migrate --plan
python manage.py migrate
```

## 2 Entrada no serializer usado pelo service

`BackEnd/postings/serializer.py:29` — procurar `class PostingInputSerializer`. Em `PostingInputSerializer.Meta.fields`, acrescentar `"categoria_autoria"` antes do fechamento da lista. Manter todos os campos e validações existentes.

## 3 Service existente

`BackEnd/postings/services.py:37` — procurar `class PostingService`. `PostingService.create` e `PostingService.update` já usam `PostingInputSerializer` e `serializer.save()`. A nova FK entra em `validated_data`; não criar outro service.

Trecho atual do método de atualização (referência, não substituir):

```python
def update(posting_id: UUID, data: Mapping[str, Any], *, actor: Users, partial: bool = False) -> Postings:
    posting = PostingService.get(posting_id, actor=actor, write=True)
    serializer = PostingInputSerializer(posting, data=data, partial=partial, context={"actor": actor})
    serializer.is_valid(raise_exception=True)
    serializer.validated_data.pop("suggestion_id", None)
    try:
        return serializer.save(updated_at=timezone.now())
    except IntegrityError as exc:
        raise Conflict("Dados em conflito com um anúncio existente.") from exc
```

## 4 Saída existente

`BackEnd/postings/serializer.py:132` — procurar `class PostingOutputSerializer`. Entre a abertura da classe e `class Meta`, acrescentar:

```python
categoria_nome = serializers.CharField(
    source="categoria_autoria.Genero", read_only=True, allow_null=True, default=None,
)
```
Em `PostingOutputSerializer.Meta.fields`, acrescentar ao final da lista:

```python
"categoria_autoria",
"categoria_nome",
```

`BackEnd/postings/serializer.py:163` — procurar `class PostingListOutputSerializer`. Entre a abertura da classe e `class Meta`, acrescentar:

```python
categoria_nome = serializers.CharField(
    source="categoria_autoria.Genero", read_only=True, allow_null=True, default=None,
)
```
Em `PostingListOutputSerializer.Meta.fields`, acrescentar ao final da lista:

```python
"categoria_autoria",
"categoria_nome",
```

`BackEnd/postings/serializer.py:203` — procurar `class PostingDetailOutputSerializer`. Entre a abertura da classe e `class Meta`, acrescentar:

```python
categoria_nome = serializers.CharField(
    source="categoria_autoria.Genero", read_only=True, allow_null=True, default=None,
)
```
Em `PostingDetailOutputSerializer.Meta.fields`, acrescentar ao final da lista:

```python
"categoria_autoria",
"categoria_nome",
```

Para listas que exibem o nome, acrescentar `"categoria_autoria"` ao `select_related` do queryset utilizado; preservar os filtros de acesso.

## 5 Frontend existente

Aplicar os campos do [guia 02, passo 3](../02_frontend_repository_store_componente.md#3-contrato-de-dados-no-fluxo-existente) nestes pontos:

| Alteração | Arquivo e âncora |
| --- | --- |
| Resposta Zod | `FrontEnd/src/features/postings/types/postingSchemas.ts:37` — procurar `export const postingDetailApiSchema` |
| Tipo de domínio | `FrontEnd/src/features/postings/types/posting.ts:22` — procurar `export interface PostingDetail` |
| Mapper de leitura | `FrontEnd/src/features/postings/api/postingMapper.ts:46` — procurar `export function detailToDomain` |
| Entrada/payload | `FrontEnd/src/features/postings/types/postingSchemas.ts:139` — procurar `export interface PostingWritePayload` |


Também ampliar `postingListItemApiSchema`, `PostingListItem` e `listItemToDomain` para o nome aparecer nos cartões.

`pages/postings/GerenciarAnuncio.tsx` já chama `updatePosting.mutateAsync({ id, payload: toEditPayload(values, coordenadas) })`.

1. Dentro de `postingEditFormSchema`, acrescentar `categoriaId: z.string().optional()`.
2. No carregamento do formulário em `GerenciarAnuncio`, preencher `categoriaId` com `posting.categoriaAutoriaId ?? ""` (usar o nome local do resultado de `usePosting`).
3. No objeto retornado por `postingMapper.toEditPayload`, acrescentar `categoria_autoria: values.categoriaId || null`.
4. Inserir `CategoriaSelect` antes do botão de salvar, usando `watch("categoriaId")` e `setValue("categoriaId", id)` do formulário existente.
5. Exibir `categoriaNome` na leitura do anúncio; `PostingRepository.update` já faz `PATCH /api/postings/<id>` e a mutation invalida o detalhe.

Na criação, repetir o campo no `postingFormSchema` e `toCreatePayload`; não remover `suggestion_id`, que pertence ao fluxo de precificação.




## 6 Comprovar

Salvar pelo formulário indicado, consultar a FK no banco e recarregar a mesma tela. Aplicar os casos de ID inexistente/permissão do [guia 03](../03_validacao_e_erros.md).
