# Estornos — `Refunds`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/payments/models.py:67` — dentro de `Refunds`, imediatamente antes de `class Meta`, inserir:

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
python manage.py makemigrations payments
python manage.py migrate --plan
python manage.py migrate
```

## 2 Origem da seleção

Concluir o [guia de usuários](../04_usuarios_pelo_fluxo_existente.md). Selecionar uma opção em Minha Conta e salvar antes da operação abaixo. Neste exemplo de ensaio, o registro novo copia o ID selecionado pelo usuário; adaptar o significado da categoria ao enunciado.

## 3 Alteração no service real

`BackEnd/payments/refunds.py:26` — procurar `def request(payment`

Dentro de `defaults` do `Refunds.objects.get_or_create`, depois de `"reason": reason, "requested_by": user,`, inserir:
```python
"categoria_autoria_id": payment.rental.lessee.categoria_autoria_id,
```
Somente o INSERT copia a seleção; a reutilização de obrigação existente preserva o histórico.

## 4 Saída persistida

`BackEnd/rentals/serializer.py` → `RentalOutputSerializer.get_refunds`: no dicionário de cada estorno, acrescentar `categoria_autoria` e `categoria_nome` obtidos do objeto `refund` (usar o nome local). O UUID deve ser convertido em `str` quando não for passado por um campo DRF.
```python
"categoria_autoria": str(refund.categoria_autoria_id) if refund.categoria_autoria_id else None,
"categoria_nome": refund.categoria_autoria.Genero if refund.categoria_autoria_id else None,
```


## 5 Frontend e comprovação

Em `features/contracts/types/management.ts`, acrescentar os campos no `refundSchema`; o tipo `RentalRefund` é inferido. Exibir o nome no painel de estornos do cartão da locação, após o cancelamento permitido pelo sistema. Preservar o processamento pelo provedor; não usar um PATCH genérico para confirmar estorno.

Executar a operação original, conferir a FK da tabela alvo no DBeaver e recarregar a consulta. Linhas antigas continuam com FK nula; não refazer pagamentos/assinaturas para preencher histórico.
