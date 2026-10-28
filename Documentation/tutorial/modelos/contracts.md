# Contratos — `Contracts`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/contracts/models.py:25` — dentro de `Contracts`, imediatamente antes de `class Meta`, inserir:

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

Concluir o [guia de usuários](../04_usuarios_pelo_fluxo_existente.md). Selecionar uma opção em Minha Conta e salvar antes da operação abaixo. Neste exemplo de ensaio, o registro novo copia o ID selecionado pelo usuário; adaptar o significado da categoria ao enunciado.

## 3 Alteração no service real

`BackEnd/contracts/services.py:73` — procurar `def create_for_rental(`

Dentro de `Contracts.objects.create`, entre `rental=rental,` e `accepted_by_lessor=False,`, inserir:
```python
categoria_autoria_id=rental.lessee.categoria_autoria_id,
```

A criação por recorrência usa outro ponto: `BackEnd/api/recurrence.py`, dentro do `Contracts.objects.create`, acrescentar a mesma atribuição. Não existe CRUD genérico de edição de contrato; não acrescentar uma edição que altere termos já assinados.

## 4 Saída persistida

`BackEnd/contracts/serializer.py:61` — procurar `class ContractOutputSerializer`. Entre a abertura da classe e `class Meta`, acrescentar:

```python
categoria_nome = serializers.CharField(
    source="categoria_autoria.Genero", read_only=True, allow_null=True, default=None,
)
```
Em `ContractOutputSerializer.Meta.fields`, acrescentar ao final da lista:

```python
"categoria_autoria",
"categoria_nome",
```

Para a página de documento, em `ContractService.get_document`, no dicionário do retorno, depois de `**document`, acrescentar:
```python
"categoria_autoria": contract.categoria_autoria_id,
"categoria_nome": contract.categoria_autoria.Genero if contract.categoria_autoria_id else None,
```
Em `ContractDocumentOutputSerializer` (Serializer comum, sem Meta), declarar `categoria_autoria = serializers.UUIDField(allow_null=True)` e `categoria_nome = serializers.CharField(allow_null=True)`. Esses metadados ficam fora do documento canônico assinado.

## 5 Frontend e comprovação

Em `features/contracts/types/contractDocument.ts`, ampliar `ContratoData` com `categoria_autoria?: string | null` e `categoria_nome?: string | null`. O repository retorna esse objeto para `pages/contracts/Contrato.tsx`; exibir `contrato.categoria_nome` usando o nome real do objeto carregado. Se usar a listagem, ampliar também `contractApiSchema`, `Contract`, `contractToDomain` como no guia 02. Criar uma locação nova após salvar o perfil.

Executar a operação original, conferir a FK da tabela alvo no DBeaver e recarregar a consulta. Linhas antigas continuam com FK nula; não refazer pagamentos/assinaturas para preencher histórico.
