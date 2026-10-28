# Leituras de horímetro — `RentalMeterReadings`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/rentals/models.py:83` — dentro de `RentalMeterReadings`, imediatamente antes de `class Meta`, inserir:

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
python manage.py makemigrations rentals
python manage.py migrate --plan
python manage.py migrate
```

## 2 Origem da seleção

Este caso recebe o UUID diretamente no formulário do horímetro. Criar `CategoriaSelect` do guia 02; não precisa modificar o perfil de usuários.

## 3 Alteração no service real

`BackEnd/rentals/meter.py:85` — procurar `def record(`

Para seleção no próprio formulário de leitura, importar `Genero` e acrescentar a `MeterReadingInputSerializer`, após `note`:
```python
categoria_autoria = serializers.PrimaryKeyRelatedField(
    queryset=Genero.objects.all(), required=False, allow_null=True,
)
```
Dentro de `RentalMeterReadings.objects.create`, entre `supersedes=latest.get(kind),` e `)`, inserir:
```python
categoria_autoria=serializer.validated_data.get("categoria_autoria"),
```
Manter o fluxo de `MeterService.record`: somente locador, contrato assinado, valores e ordem de retirada/devolução válidos.

## 4 Saída persistida

`BackEnd/rentals/serializer.py:238` — procurar `class RentalMeterReadingOutputSerializer`. Entre a abertura da classe e `class Meta`, acrescentar:

```python
categoria_nome = serializers.CharField(
    source="categoria_autoria.Genero", read_only=True, allow_null=True, default=None,
)
```
Em `RentalMeterReadingOutputSerializer.Meta.fields`, acrescentar ao final da lista:

```python
"categoria_autoria",
"categoria_nome",
```

Em `rentals/meter.py`, `_reading_payload`, depois de `"id": str(reading.id)`, inserir:
```python
"categoria_autoria": str(reading.categoria_autoria_id) if reading.categoria_autoria_id else None,
"categoria_nome": reading.categoria_autoria.Genero if reading.categoria_autoria_id else None,
```
Essa projeção alimenta `rental.meter.check_in/check_out` depois de recarregar.

## 5 Frontend e comprovação

`features/contracts/types/rentalSchemas.ts`: ampliar `meterReadingApiSchema`; `rental.ts`: ampliar `MeterReading`; `contractMapper.ts`: ampliar `readingToDomain`.

Em `ContractRepository.ts`, localizar `recordMeterReading`; acrescentar `categoria_autoria?: string | null` ao tipo de entrada e ao body se ele for montado manualmente. Propagar pelo `ContractStore.recordMeterReading` e pela variável de `useRecordMeterReading`.

No formulário de leitura de `features/dashboard/components/RentalCard.tsx`, adicionar estado/seletor e enviar o ID junto de `kind`, `value`, `note` através do callback existente. Exibir `rental.meter.checkIn?.categoriaNome` e `checkOut?.categoriaNome` usando os nomes de domínio locais.

Executar a operação original, conferir a FK da tabela alvo no DBeaver e recarregar a consulta. Linhas antigas continuam com FK nula; não refazer pagamentos/assinaturas para preencher histórico.
