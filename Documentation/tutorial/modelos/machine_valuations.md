# Pesquisas de valor — `MachineValuations`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/pricing/models.py:27` — dentro de `MachineValuations`, imediatamente antes de `class Meta`, inserir:

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
python manage.py makemigrations pricing
python manage.py migrate --plan
python manage.py migrate
```

## 2 Origem da seleção

Para esta tabela interna, adaptar o catálogo ao domínio (por exemplo, tipos de pesquisa). O formulário de sugestão recebe a escolha; `Genero` é apenas o nome técnico já existente no ensaio. Cache compartilhado pede uma regra de negócio explícita para quem pode reclassificá-lo.

## 3 Alteração no service real

`BackEnd/pricing/service.py:105` — procurar `def _store_valuation(`

O cache é compartilhado por marca/modelo/ano. Este caso exige definir uma classificação do cache, não copiar gênero pessoal. No exemplo de categoria do exercício:

1. Acrescentar parâmetro keyword opcional `categoria_autoria=None` a `_store_valuation` e a `build_suggestion`.
2. Na chamada de `_store_valuation` dentro de `build_suggestion`, repassar o objeto validado.
3. Nos dois dicionários `create_defaults` e `defaults` do `update_or_create`, acrescentar:
```python
"categoria_autoria": categoria_autoria,
```
4. Em `SuggestionRequestSerializer`, declarar `PrimaryKeyRelatedField(queryset=Genero.objects.all(), required=False, allow_null=True)` após importar `Genero`.
5. Em `pricing_suggest`, repassar `categoria_autoria=serializer.validated_data.get("categoria_autoria")` a `build_suggestion`.

Uma consulta com cache válido não chama `_store_valuation`. Para testar, usar marca/modelo/ano sem cache ou expiração controlada no banco de ensaio. Não apagar todo o cache.

## 4 Saída persistida

`MachineValuations` não tem GET próprio. Em `pricing_suggest`, após calcular a sugestão, consultar `_cached_valuation(machine.brand, machine.model, machine.year)` pelo service existente e retornar `pesquisa_categoria_nome` do registro encontrado. Declarar o campo em `SuggestionResponseSerializer`. Para leitura posterior sem refazer pesquisa, ampliar `MachineOutputSerializer` com um método que consulte o cache por marca/modelo/ano e devolva apenas a classificação; registrar esse campo em Meta.fields.

## 5 Frontend e comprovação

Adicionar `categoria_autoria` ao tipo de pedido e body de `PricingRepository`; usar `CategoriaSelect` no formulário que solicita a sugestão. Ampliar `pricingSuggestionSchema`/`PricingSuggestion` para a resposta imediata; ampliar `machineApiSchema`, `Machine`, `machineMapper.toDomain` para `pesquisa_categoria_nome` e exibir no cartão da máquina após recarregar. Não afirmar sucesso se somente a resposta transitória mostrar a escolha.

Executar a operação original, conferir a FK da tabela alvo no DBeaver e recarregar a consulta. Linhas antigas continuam com FK nula; não refazer pagamentos/assinaturas para preencher histórico.
