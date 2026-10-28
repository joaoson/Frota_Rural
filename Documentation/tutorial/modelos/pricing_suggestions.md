# Sugestões de preço — `PricingSuggestions`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/pricing/models.py:74` — dentro de `PricingSuggestions`, imediatamente antes de `class Meta`, inserir:

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

Concluir o [guia de usuários](../04_usuarios_pelo_fluxo_existente.md). Selecionar uma opção em Minha Conta e salvar antes da operação abaixo. Neste exemplo de ensaio, o registro novo copia o ID selecionado pelo usuário; adaptar o significado da categoria ao enunciado.

## 3 Alteração no service real

`BackEnd/pricing/service.py:238` — procurar `def build_suggestion(`

Dentro de `PricingSuggestions.objects.create`, entre `machinery=machine,` e `suggested_hourly_rate=anchored,`, inserir:
```python
categoria_autoria_id=machine.owner.categoria_autoria_id,
```
A função continua calculando e gravando o preço pelo fluxo atual. Não substituir cálculo por valor enviado pelo cliente.

## 4 Saída persistida

Em `pricing/views.py`, depois que `build_suggestion` retorna e antes de `return Response`, ler o registro criado:
```python
from pricing.models import PricingSuggestions
registro = PricingSuggestions.objects.select_related("categoria_autoria").get(pk=suggestion.suggestion_id)
```
Acrescentar ao dicionário da resposta `categoria_autoria` (UUID convertido para string ou null) e `categoria_nome`, lidos de `registro`. Declarar os campos em `SuggestionResponseSerializer`.

Para persistência visível após F5: `PostingService._link_pricing_suggestion` já relaciona sugestão/anúncio. Acrescentar um `SerializerMethodField` em `PostingDetailOutputSerializer` que consulte `PricingSuggestions` pelo anúncio, ordene por `-created_at` e devolva o nome da categoria da sugestão vinculada; não gerar outra pesquisa para ler a anterior.

## 5 Frontend e comprovação

Ampliar `pricingSuggestionSchema` e `PricingSuggestion` com os campos snake_case usados nessa feature; mostrar o nome no componente da sugestão. Para o F5, ampliar `postingDetailApiSchema`, `PostingDetail` e `detailToDomain` com o nome persistido exposto no passo 4 e exibir no detalhe do anúncio. A pesquisa externa exige provedor configurado ou teste com mock; o ambiente isolado tem as chaves vazias.

Executar a operação original, conferir a FK da tabela alvo no DBeaver e recarregar a consulta. Linhas antigas continuam com FK nula; não refazer pagamentos/assinaturas para preencher histórico.
