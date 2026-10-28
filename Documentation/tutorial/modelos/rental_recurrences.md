# Recorrências — `RentalRecurrence`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/api/models.py:24` — dentro de `RentalRecurrence`, imediatamente antes de `class Meta`, inserir:

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
python manage.py makemigrations api
python manage.py migrate --plan
python manage.py migrate
```

## 2 Origem da seleção

Usar seletor no diálogo de recorrência; a FK pertence à série, não precisa duplicá-la em cada ocorrência.

## 3 Alteração no service real

`BackEnd/api/recurrence.py:142` — procurar `def create_recurrence(`

Importar `Genero` e acrescentar a `RecurrenceCreateRequestSerializer`, depois de `idempotency_key`:
```python
categoria_autoria = serializers.PrimaryKeyRelatedField(
    queryset=Genero.objects.all(), required=False, allow_null=True,
)
```
Em `create_recurrence`, dentro de `RentalRecurrence.objects.create`, depois de `total_price=preview['total_price'],`, inserir:
```python
categoria_autoria=data.get("categoria_autoria"),
```
A repetição da chave também precisa comparar a nova escolha. Na condição `if (existing.source_rental_id != ... or ...)`, acrescentar:
```python
or existing.categoria_autoria_id != (data["categoria_autoria"].pk if data.get("categoria_autoria") else None)
```
Não modificar preview, cálculo de preços ou locks.

## 4 Saída persistida

Em `series_response`, depois de `'id': series.pk`, acrescentar os dois campos, lendo `series.categoria_autoria`. Em `api/recurrence_views.py`, `RecurrenceResponseSerializer`, declarar UUID nullable e CharField nullable.

Para ler após F5, a API atual lista locações, não uma lista independente de séries. Acrescentar em `RentalOutputSerializer`:

```python
recorrencia_categoria_nome = serializers.CharField(
    source="recurrence.categoria_autoria.Genero", allow_null=True, default=None, read_only=True,
)
# Acrescentar "recorrencia_categoria_nome" em Meta.fields.
```


## 5 Frontend e comprovação

`features/contracts/types/recurrence.ts`: adicionar `categoria_autoria?: string | null` a `CreateRecurrenceInput`; ampliar `recurrenceCreatedSchema` com ID/nome.

`RentalRecurrenceDialog.tsx`: estado/seletor e `categoria_autoria` no payload de criação. `ContractRepository.createRecurrence` já recebe esse payload; manter a mesma chave em retries e gerar nova chave se a seleção mudar.

Para exibir depois de F5, ampliar `rentalApiSchema`, `Rental`, `rentalToDomain` com `recorrencia_categoria_nome → recorrenciaCategoriaNome`, e propagar ao cartão da locação. Exibir o nome da série nesse cartão.

Executar a operação original, conferir a FK da tabela alvo no DBeaver e recarregar a consulta. Linhas antigas continuam com FK nula; não refazer pagamentos/assinaturas para preencher histórico.
