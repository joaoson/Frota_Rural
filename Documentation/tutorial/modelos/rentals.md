# Locações — `Rentals`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/rentals/models.py:48` — dentro de `Rentals`, imediatamente antes de `class Meta`, inserir:

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

## 2 Entrada no serializer usado pelo service

`BackEnd/rentals/serializer.py:41` — procurar `class RentalInputSerializer`. Em `RentalInputSerializer.Meta.fields`, acrescentar `"categoria_autoria"` antes do fechamento da lista. Manter todos os campos e validações existentes.

## 3 Service existente

`BackEnd/rentals/services.py:31` — procurar `class RentalService`. `RentalService.create` e `RentalService.update` já usam `RentalInputSerializer` e `serializer.save()`. A nova FK entra em `validated_data`; não criar outro service.

Trecho atual do método de atualização (referência, não substituir):

```python
def update(rental_id: UUID, data: Mapping[str, Any], *, user, partial: bool = False) -> Rentals:
    reference = RentalService.get(rental_id, user=user)
    posting = Postings.objects.select_for_update().select_related("machinery").get(pk=reference.postings_id)
    # Avoid locking nullable outer joins from the output queryset.
    rental = Rentals.objects.select_for_update().get(pk=reference.pk)
    rental.postings = posting
    for field, current in (("lessee", rental.lessee_id), ("postings", rental.postings_id)):
        if field in data and str(data[field]) != str(current):
            raise ValidationError({field: "Este vínculo não pode ser alterado após a criação."})
    if "total_price" in data:
        raise ValidationError({"total_price": "O valor é calculado pelo servidor."})
    if "status" in data:
        raise Conflict("Use /api/rentals/<id>/cancel para cancelar ou /complete para concluir.", code="use_rental_action")
    if any(field in data for field in ("start_date", "end_date", "operator")):
        if user.pk != rental.lessee_id:
            raise PermissionDenied("Somente o locatário pode alterar os dados de uma reserva pendente.")
        if rental.status != RentalStatus.PENDING or rental.payments.filter(status__in=OPEN_PAYMENT_STATUSES).exists():
            raise Conflict("Uma reserva em pagamento ou confirmada não pode ter seus dados alterados.")
    if any(field in data for field in ("initial_hour_meter", "final_hour_meter")):
        raise ValidationError({"detail": (
            "Registre as leituras do horímetro em /api/rentals/<id>/meter-readings: "
            "elas são validadas e ficam no histórico da locação."
        )})
    if "notes" in data:
        if user.pk != rental.lessee_id:
            raise PermissionDenied("Somente o locatário pode alterar as observações da reserva.")
        if rental.status in (RentalStatus.CANCELLED, RentalStatus.COMPLETED, RentalStatus.CLOSED):
            raise Conflict("As observações de uma locação encerrada não podem ser alteradas.")
    serializer = RentalInputSerializer(rental, data=data, partial=partial)
    serializer.is_valid(raise_exception=True)
    validated = serializer.validated_data
    if any(field in validated for field in ("operator", "start_date", "end_date")):
        validated["operator"] = validate_operator_assignment(
            validated.get("operator", rental.operator), rental.lessee, lock=True,
        )
    changed = any(getattr(rental, field) != value for field, value in validated.items())
    save_fields = {"updated_at": timezone.now()}
    if any(field in validated for field in ("start_date", "end_date")):
        start = validated.get("start_date", rental.start_date)
        end = validated.get("end_date", rental.end_date)
        RentalService._ensure_period_available(posting, start, end, ignore_rental_id=rental.pk)
        # Only an unpaid pending booking reaches this point (checked above).
        # The agreed price changes only when the tenant picks other dates.
        if (start, end) != (rental.start_date, rental.end_date):
            policy.ensure_lead_time(start)
            quote = RentalService.quote(posting, start, end)
            save_fields.update(quote.snapshot())
            changed = changed or rental.total_price != quote.total
    rental = serializer.save(**save_fields)
    if changed:
        notify_rental_event(rental, "rental_updated", event_key=f"rental:{rental.pk}:rental_updated:{uuid4()}")
    return rental
```

## 4 Saída existente

`BackEnd/rentals/serializer.py:114` — procurar `class RentalOutputSerializer`. Entre a abertura da classe e `class Meta`, acrescentar:

```python
categoria_nome = serializers.CharField(
    source="categoria_autoria.Genero", read_only=True, allow_null=True, default=None,
)
```
Em `RentalOutputSerializer.Meta.fields`, acrescentar ao final da lista:

```python
"categoria_autoria",
"categoria_nome",
```

Para listas que exibem o nome, acrescentar `"categoria_autoria"` ao `select_related` do queryset utilizado; preservar os filtros de acesso.

## 5 Frontend existente

Aplicar os campos do [guia 02, passo 3](../02_frontend_repository_store_componente.md#3-contrato-de-dados-no-fluxo-existente) nestes pontos:

| Alteração | Arquivo e âncora |
| --- | --- |
| Resposta Zod | `FrontEnd/src/features/contracts/types/rentalSchemas.ts:14` — procurar `export const rentalApiSchema` |
| Tipo de domínio | `FrontEnd/src/features/contracts/types/rental.ts:4` — procurar `export interface Rental` |
| Mapper de leitura | `FrontEnd/src/features/contracts/api/contractMapper.ts:35` — procurar `export function rentalToDomain` |
| Entrada/payload | `FrontEnd/src/features/contracts/types/rentalSchemas.ts:85` — procurar `export interface CreateRentalPayload` |


`pages/postings/Reservar.tsx` → `contractStore.createRental` → `ContractRepository.createRental` → `POST /api/rentals`.

1. Adicionar estado `categoriaId` perto de `observacoes`.
2. Inserir `CategoriaSelect` ao lado do campo de observações.
3. Dentro do objeto de `contractStore.createRental`, depois de `notes`, acrescentar `categoria_autoria: categoriaId || null`.
4. Propagar `categoriaNome` no objeto de locação montado pelos dashboards e no tipo de `features/dashboard/components/RentalCard.tsx`; exibir no cartão a partir da locação retornada pelo GET.

O fluxo de pagamento pode reutilizar uma reserva já criada. Testar com uma reserva NOVA; não mostrar uma escolha ainda não enviada como se já estivesse salva.



**Regra de edição:** se permitir PATCH de categoria, em `RentalService.update`, antes de construir `RentalInputSerializer`, aplicar a mesma restrição de `notes`: somente locatário e locação aberta. Não incluir o campo na lista de parâmetros imutáveis de preço/datas nem permitir que o frontend controle preço, status ou disponibilidade.


## 6 Comprovar

Salvar pelo formulário indicado, consultar a FK no banco e recarregar a mesma tela. Aplicar os casos de ID inexistente/permissão do [guia 03](../03_validacao_e_erros.md).
