# Máquinas — `Machines`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/machines/models.py:32` — dentro de `Machines`, imediatamente antes de `class Meta`, inserir:

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
python manage.py makemigrations machines
python manage.py migrate --plan
python manage.py migrate
```

## 2 Entrada no serializer usado pelo service

`BackEnd/machines/serializer.py:17` — procurar `class MachineInputSerializer`. Em `MachineInputSerializer.Meta.fields`, acrescentar `"categoria_autoria"` antes do fechamento da lista. Manter todos os campos e validações existentes.

## 3 Service existente

`BackEnd/machines/services.py:20` — procurar `class MachineService`. `MachineService.create` e `MachineService.update` já usam `MachineInputSerializer` e `serializer.save()`. A nova FK entra em `validated_data`; não criar outro service.

Trecho atual do método de atualização (referência, não substituir):

```python
def update(machine_id: UUID, data: Mapping[str, Any], *, actor: Users, partial: bool = False) -> Machines:
    machine = MachineService.get(machine_id, actor=actor)
    serializer = MachineInputSerializer(machine, data=data, partial=partial, context={"actor": actor})
    serializer.is_valid(raise_exception=True)
    now = timezone.now()
    if "hour_meter" in serializer.validated_data and serializer.validated_data["hour_meter"] != machine.hour_meter:
        serializer.validated_data["hour_meter_updated_at"] = now
    try:
        return serializer.save(updated_at=now)
    except IntegrityError as exc:
        raise Conflict(CONFLICT_MESSAGE) from exc
```

## 4 Saída existente

`BackEnd/machines/serializer.py:75` — procurar `class MachineOutputSerializer`. Entre a abertura da classe e `class Meta`, acrescentar:

```python
categoria_nome = serializers.CharField(
    source="categoria_autoria.Genero", read_only=True, allow_null=True, default=None,
)
```
Em `MachineOutputSerializer.Meta.fields`, acrescentar ao final da lista:

```python
"categoria_autoria",
"categoria_nome",
```

Para listas que exibem o nome, acrescentar `"categoria_autoria"` ao `select_related` do queryset utilizado; preservar os filtros de acesso.

## 5 Frontend existente

Aplicar os campos do [guia 02, passo 3](../02_frontend_repository_store_componente.md#3-contrato-de-dados-no-fluxo-existente) nestes pontos:

| Alteração | Arquivo e âncora |
| --- | --- |
| Resposta Zod | `FrontEnd/src/features/machines/types/machineSchemas.ts:21` — procurar `export const machineApiSchema` |
| Tipo de domínio | `FrontEnd/src/features/machines/types/machine.ts:1` — procurar `export interface Machine` |
| Mapper de leitura | `FrontEnd/src/features/machines/api/machineMapper.ts:15` — procurar `export function toDomain` |
| Entrada/payload | `FrontEnd/src/features/machines/types/machineSchemas.ts:79` — procurar `export interface CreateMachinePayload` |


**Criação existente:** `features/machines/hooks/useMachineForm.ts` → `toCreatePayload` → `useCreateMachine` → `MachineRepository.create` → `POST /api/machines`.

1. Acrescentar `categoriaId: z.string().optional()` ao objeto de `machineFormSchema`, antes de `.superRefine`.
2. Em `machineMapper.ts`, dentro de `toCreatePayload`, acrescentar `categoria_autoria: values.categoriaId || null` ao retorno.
3. Em `pages/machines/NovoEquipamento.tsx`, usar `CategoriaSelect` no formulário e ligar `value={form.watch("categoriaId") ?? ""}` / `onChange={(id) => form.setValue("categoriaId", id)}`; usar o nome real da instância de `useForm` retornada por `useMachineForm`.

**Edição existente:** `components/EditEquipamentoModal.tsx` → `DashboardLocador.tsx` → `useUpdateMachine` → `PATCH /api/machines/<id>`.

- Em `EquipamentoData`, adicionar `categoriaId?: string`; no modal, `value={form.categoriaId ?? ""}` e `onChange={(id) => handleChange("categoriaId", id)}`.
- Em `DashboardLocador`, preencher `categoriaId` no objeto de `setSelectedEquipamento` a partir da máquina persistida e incluir `categoria_autoria: data.categoriaId || null` junto de `technical_specifications` no payload de `updateMachine.mutateAsync`.
- Em `DashboardLocador.tsx`, o `useMemo` chamado `machines` transforma `machinesQuery.data`. Acrescentar `categoriaAutoriaId: m.categoriaAutoriaId` e `categoriaNome: m.categoriaNome` nesse objeto, logo após `purpose`. Em `openEditModalForMachine`, inserir `categoriaId: m.categoriaAutoriaId ?? ""` no objeto de `setSelectedEquipamento`. Exibir `m.categoriaNome` no cartão persistido.




## 6 Comprovar

Salvar pelo formulário indicado, consultar a FK no banco e recarregar a mesma tela. Aplicar os casos de ID inexistente/permissão do [guia 03](../03_validacao_e_erros.md).
