# Aditivos — `ContractAmendments`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/contracts/models.py:201` — dentro de `ContractAmendments`, imediatamente antes de `class Meta`, inserir:

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
python manage.py makemigrations contracts
python manage.py migrate --plan
python manage.py migrate
```

## 2 Origem da seleção

Usar o seletor no próprio formulário de aditivo. Não modificar o perfil. A classificação pertence à proposta criada, sem alterar a revisão assinada.

## 3 Alteração no service real

`BackEnd/contracts/amendments.py:99` — procurar `def propose(`

Importar `Genero` no arquivo. Em `AmendmentInputSerializer`, depois de `reason`, acrescentar:
```python
categoria_autoria = serializers.PrimaryKeyRelatedField(
    queryset=Genero.objects.all(), required=False, allow_null=True,
)
```
`AmendmentService.propose` já faz `values = serializer.validated_data` e passa `**values` ao `ContractAmendments.objects.create`. Não precisa de outro save. Manter `base_revision`, prazo e verificação das datas.

## 4 Saída persistida

`BackEnd/contracts/amendments.py:29` — procurar `class AmendmentOutputSerializer`. Entre a abertura da classe e `class Meta`, acrescentar:

```python
categoria_nome = serializers.CharField(
    source="categoria_autoria.Genero", read_only=True, allow_null=True, default=None,
)
```
Em `AmendmentOutputSerializer.Meta.fields`, acrescentar ao final da lista:

```python
"categoria_autoria",
"categoria_nome",
```


## 5 Frontend e comprovação

Em `features/contracts/types/management.ts`, acrescentar os campos de saída ao `amendmentSchema` **e ao `.transform`**; acrescentar `categoriaAutoriaId?: string | null` à interface `AmendmentInput`.

Em `ContractRepository.proposeAmendment`, adicionar `categoria_autoria: input.categoriaAutoriaId ?? null` ao body existente. Em `ContractAmendmentsPanel.tsx`:

```tsx
// Depois do estado reason:
const [categoriaId, setCategoriaId] = useState("");
// No objeto enviado em proposal.mutate:
categoriaAutoriaId: categoriaId || null,
// No formulário, depois do motivo:
<CategoriaSelect value={categoriaId} onChange={setCategoriaId} />
// Dentro de list.data?.map(item => ...):
<p>Categoria: {item.categoriaNome ?? "Não informado"}</p>
```

Adicionar o import do seletor. Criar proposta nova num contrato elegível; recarregar a lista de aditivos.

Executar a operação original, conferir a FK da tabela alvo no DBeaver e recarregar a consulta. Linhas antigas continuam com FK nula; não refazer pagamentos/assinaturas para preencher histórico.
