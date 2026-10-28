# Pagamentos — `Payments`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/payments/models.py:26` — dentro de `Payments`, imediatamente antes de `class Meta`, inserir:

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

`BackEnd/payments/services.py:172` — procurar `def _new_attempt(`

Dentro de `Payments.objects.create`, depois de `id=payment_id, rental=rental, ...`, antes de `idempotency_key`, inserir:
```python
categoria_autoria_id=rental.lessee.categoria_autoria_id,
```
Não incluir a categoria em `provider_request`, valor, status ou chave de idempotência. Repetir o mesmo checkout reutiliza o registro existente e sua categoria original.

## 4 Saída persistida

`BackEnd/payments/serializer.py:16` — procurar `class PaymentStatusOutputSerializer`. Entre a abertura da classe e `class Meta`, acrescentar:

```python
categoria_nome = serializers.CharField(
    source="categoria_autoria.Genero", read_only=True, allow_null=True, default=None,
)
```
Em `PaymentStatusOutputSerializer.Meta.fields`, acrescentar ao final da lista:

```python
"categoria_autoria",
"categoria_nome",
```


## 5 Frontend e comprovação

`features/payments/types/paymentSchemas.ts`, `payment.ts`, `api/paymentMapper.ts`: ampliar schema de status, tipo e mapper com os campos do guia 02. `PaymentRepository` já consulta status por locação. Em `pages/postings/Reservar.tsx`, exibir o nome do pagamento retornado por essa consulta. Criar uma tentativa nova para verificar. Checkout real requer credenciais Stripe de teste; o ambiente isolado não as tem.

Executar a operação original, conferir a FK da tabela alvo no DBeaver e recarregar a consulta. Linhas antigas continuam com FK nula; não refazer pagamentos/assinaturas para preencher histórico.
