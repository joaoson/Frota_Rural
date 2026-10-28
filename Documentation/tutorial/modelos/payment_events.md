# Eventos de pagamento — `PaymentEvents`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/payments/models.py:44` — dentro de `PaymentEvents`, imediatamente antes de `class Meta`, inserir:

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

`BackEnd/payments/services.py:297` — procurar `def handle_webhook(`

Depois de validar assinatura e extrair `session_id`, antes de `event_id = ...`, acrescentar:
```python
payment_id = _get(_get(session, "metadata") or {}, "payment_id")
payment = PaymentService._find_payment(session_id, payment_id) if event_type not in REFUND_EVENTS else None
categoria_id = payment.rental.lessee.categoria_autoria_id if payment else None
```
Dentro de `defaults` do `PaymentEvents.objects.get_or_create`, acrescentar `"categoria_autoria_id": categoria_id`. Remover a atribuição duplicada de `payment_id` mais abaixo. Este exemplo classifica eventos de checkout associados a pagamento; eventos de estorno/desconhecidos ficam nulos. A PK de PaymentEvents é string.

Preservar assinatura do webhook, lista de tipos aceitos, `processed_at` e deduplicação. Um JSON comum enviado pelo navegador não substitui um webhook assinado.

## 4 Saída persistida

Não existe GET de eventos públicos. Para mostrar somente os eventos do pagamento autorizado, em `PaymentStatusOutputSerializer` acrescentar um `SerializerMethodField`:

```python
eventos_autoria = serializers.SerializerMethodField()

def get_eventos_autoria(self, obj):
    from payments.models import PaymentEvents
    if not obj.session_id:
        return []
    return [
        {"id": event.pk,
         "categoria_nome": event.categoria_autoria.Genero if event.categoria_autoria_id else None}
        for event in PaymentEvents.objects.filter(session_id=obj.session_id)
        .select_related("categoria_autoria").order_by("received_at")
    ]
```
Acrescentar `"eventos_autoria"` a Meta.fields; manter o acesso à locação no service que consulta o status.

## 5 Frontend e comprovação

No schema de status em `features/payments/types/paymentSchemas.ts`, acrescentar `eventos_autoria: z.array(z.object({ id: z.string(), categoria_nome: z.string().nullable() })).optional()`; propagar no tipo/mapper de pagamento. Exibir a lista na seção de status de `pages/postings/Reservar.tsx`. Recarregar o status após um evento de teste válido. O ambiente isolado não tem webhook/Stripe configurado; usar mocks nos testes existentes para exercitar a gravação sem alterar confirmações de pagamentos reais.

Executar a operação original, conferir a FK da tabela alvo no DBeaver e recarregar a consulta. Linhas antigas continuam com FK nula; não refazer pagamentos/assinaturas para preencher histórico.
