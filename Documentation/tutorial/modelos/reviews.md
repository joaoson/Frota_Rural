# Avaliações — `Reviews`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/reviews/models.py:15` — dentro de `Reviews`, imediatamente antes de `class Meta`, inserir:

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
python manage.py makemigrations reviews
python manage.py migrate --plan
python manage.py migrate
```

## 2 Entrada no serializer usado pelo service

`BackEnd/reviews/serializer.py:11` — procurar `class ReviewInputSerializer`. Em `ReviewInputSerializer.Meta.fields`, acrescentar `"categoria_autoria"` antes do fechamento da lista. Manter todos os campos e validações existentes.

## 3 Service existente

`BackEnd/reviews/services.py:20` — procurar `class ReviewService`. `ReviewService.create` e `ReviewService.update` já usam `ReviewInputSerializer` e `serializer.save()`. A nova FK entra em `validated_data`; não criar outro service.

Trecho atual do método de atualização (referência, não substituir):

```python
def update(review_id: UUID, data: Mapping[str, Any], *, user, partial: bool = False) -> Reviews:
    review = ReviewService.get(review_id, user=user, for_write=True)
    serializer = ReviewInputSerializer(review, data=data, partial=partial, context={"user": user})
    serializer.is_valid(raise_exception=True)
    try:
        return serializer.save()
    except IntegrityError as exc:
        raise Conflict(DUPLICATE_REVIEW_MESSAGE, code="already_reviewed") from exc
```

## 4 Saída existente

`BackEnd/reviews/serializer.py:57` — procurar `class ReviewOutputSerializer`. Entre a abertura da classe e `class Meta`, acrescentar:

```python
categoria_nome = serializers.CharField(
    source="categoria_autoria.Genero", read_only=True, allow_null=True, default=None,
)
```
Em `ReviewOutputSerializer.Meta.fields`, acrescentar ao final da lista:

```python
"categoria_autoria",
"categoria_nome",
```

Para listas que exibem o nome, acrescentar `"categoria_autoria"` ao `select_related` do queryset utilizado; preservar os filtros de acesso.

## 5 Frontend existente

Aplicar os campos do [guia 02, passo 3](../02_frontend_repository_store_componente.md#3-contrato-de-dados-no-fluxo-existente) nestes pontos:

| Alteração | Arquivo e âncora |
| --- | --- |
| Resposta Zod | `FrontEnd/src/features/reviews/types/reviewSchemas.ts:6` — procurar `export const reviewApiSchema` |
| Tipo de domínio | `FrontEnd/src/features/reviews/types/review.ts:1` — procurar `export interface Review` |
| Mapper de leitura | `FrontEnd/src/features/reviews/api/reviewMapper.ts:4` — procurar `export function toDomain` |
| Entrada/payload | `FrontEnd/src/features/reviews/types/reviewSchemas.ts:30` — procurar `export interface CreateReviewPayload` |


`pages/dashboard/DashboardLocador.tsx` e `DashboardLocatario.tsx` chamam `createReview.mutateAsync` → `useCreateReview` → `ReviewRepository.create` → `POST /api/reviews`.

1. Adicionar estado `reviewCategoriaId` perto de `reviewRating` no dashboard escolhido.
2. Passar valor/onChange ao formulário de avaliação existente; acrescentar essas props ao componente que recebe `reviewRating`.
3. Renderizar `CategoriaSelect` antes do botão de enviar.
4. Em cada payload `createReview.mutateAsync` usado pelo formulário, acrescentar `categoria_autoria: reviewCategoriaId || null` depois de `comment`.
5. Em `features/dashboard/components/ReviewsSection.tsx`, exibir `review.categoriaNome` no item recebido pela consulta (ajustar o nome local do item).

O repository frontend atual tem criação/listagem/remoção, não edição. Use a criação para este ensaio; não chamar um método `update` inexistente.




## 6 Comprovar

Salvar pelo formulário indicado, consultar a FK no banco e recarregar a mesma tela. Aplicar os casos de ID inexistente/permissão do [guia 03](../03_validacao_e_erros.md).
