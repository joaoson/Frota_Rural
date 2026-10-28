# Revisões de contrato — `ContractRevisions`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/contracts/models.py:54` — dentro de `ContractRevisions`, imediatamente antes de `class Meta`, inserir:

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

`BackEnd/contracts/revisions.py:19` — procurar `def freeze_revision(`

Dentro de `ContractRevisions.objects.create`, entre `contract=contract,` e `number=last + 1,`, inserir:
```python
categoria_autoria_id=contract.rental.lessee.categoria_autoria_id,
```
A atribuição acontece apenas no INSERT. Não alterar revisões existentes nem o hash/documento congelado.

## 4 Saída persistida

Em `BackEnd/contracts/services.py`, `ContractService._revision_summary`, no dicionário depois de `"id": revision.id`, inserir:
```python
"categoria_autoria": revision.categoria_autoria_id,
"categoria_nome": revision.categoria_autoria.Genero if revision.categoria_autoria_id else None,
```
Em `BackEnd/contracts/serializer.py`, `_RevisionSummarySerializer`, declarar os dois campos simples: UUID nullable e CharField nullable. Manter `_revision_summary(None) → None`.

## 5 Frontend e comprovação

Em `features/contracts/types/contractDocument.ts`, ampliar `RevisaoContrato` com os campos snake_case acima. Em `pages/contracts/Contrato.tsx`, exibir o nome dentro da seção da revisão usando `documento.revisao?.categoria_nome` (substituir `documento` pelo identificador local). Uma revisão nasce no congelamento após pagamento ou no aditivo aceito. O ambiente isolado não tem Stripe configurado; use o fluxo de teste já existente ou contrato pago do seed elegível. Não simular aprovação editando status no banco.

Executar a operação original, conferir a FK da tabela alvo no DBeaver e recarregar a consulta. Linhas antigas continuam com FK nula; não refazer pagamentos/assinaturas para preencher histórico.
