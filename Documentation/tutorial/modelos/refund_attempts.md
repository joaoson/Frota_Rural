# Tentativas de estorno — `RefundAttempts`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/payments/models.py:83` — dentro de `RefundAttempts`, imediatamente antes de `class Meta`, inserir:

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

`BackEnd/payments/refunds.py:37` — procurar `def _prepare(refund_id)`

Dentro de `RefundAttempts.objects.create`, antes de `idempotency_key`, inserir:
```python
categoria_autoria_id=payment.rental.lessee.categoria_autoria_id,
```
Manter a condição que só permite uma nova tentativa após falha terminal confirmada. Para congelar a classificação da obrigação em vez do perfil, concluir também o guia Refunds e usar `refund.categoria_autoria_id`.

## 4 Saída persistida

Não existe listagem pública de tentativas. Na saída autenticada de locação (`RentalOutputSerializer.get_refunds`), acrescentar ao dicionário do estorno uma lista mínima:
```python
"tentativas": [
    {"id": str(attempt.pk), "numero": attempt.number,
     "categoria_nome": attempt.categoria_autoria.Genero if attempt.categoria_autoria_id else None}
    for attempt in refund.attempts.select_related("categoria_autoria").order_by("number")
],
```
Adaptar `refund` ao nome local do loop. Não expor chaves de idempotência nem dados internos do provedor.

## 5 Frontend e comprovação

No `refundSchema` de `features/contracts/types/management.ts`, adicionar `tentativas: z.array(z.object({ id: z.string(), numero: z.number(), categoria_nome: z.string().nullable() })).optional()`. Renderizar a lista no painel de estorno da locação; depois de F5, ler a mesma lista do GET. O fluxo depende de um estorno elegível e do provedor de teste.

Executar a operação original, conferir a FK da tabela alvo no DBeaver e recarregar a consulta. Linhas antigas continuam com FK nula; não refazer pagamentos/assinaturas para preencher histórico.
