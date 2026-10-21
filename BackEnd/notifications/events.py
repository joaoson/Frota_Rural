"""Explicit, transactional in-app events; no email or external delivery.

Business callers hold their rental/posting locks. A durable key per recipient
deduplicates retries even after the recipient dismisses the notification.
"""
from django.db import transaction

from .models import Notification


EVENTS = {
    'rental_created': ('rental', 'Reserva criada', 'A reserva foi criada e aguarda pagamento.'),
    'recurrence_created': ('rental', 'Reserva recorrente criada', 'Uma nova reserva da programação de recorrência foi criada e aguarda pagamento.'),
    'rental_updated': ('rental', 'Locação atualizada', 'As informações da locação foram atualizadas. Confira os dados da reserva.'),
    'rental_cancelled': ('rental', 'Reserva cancelada', 'A reserva foi cancelada.'),
    'rental_completed': ('rental', 'Locação concluída', 'O locador registrou a conclusão da locação.'),
    'meter_check_in_recorded': ('rental', 'Horímetro registrado na retirada', 'O locador registrou a leitura do horímetro na retirada. É só acompanhamento de uso: o valor da locação não muda.'),
    'meter_check_out_recorded': ('rental', 'Horímetro registrado na devolução', 'O locador registrou a leitura do horímetro na devolução. É só acompanhamento de uso: o valor da locação não muda.'),
    'payment_pending': ('payment', 'Pagamento aguardando confirmação', 'O pagamento foi iniciado. A confirmação será informada aqui.'),
    'payment_approved': ('payment', 'Pagamento confirmado', 'O pagamento foi confirmado e a reserva está ativa. O contrato está disponível para assinatura.'),
    'payment_expired': ('payment', 'Prazo de pagamento encerrado', 'Uma tentativa de pagamento expirou ou não foi concluída. Confira a situação atual da reserva.'),
    'payment_requires_review': ('payment', 'Pagamento em análise', 'O pagamento foi recebido, mas a reserva precisa de revisão. Entre em contato com o suporte antes de iniciar a locação.'),
    'contract_signed_locatario': ('contract', 'Locatário assinou o contrato', 'A assinatura do locatário foi registrada no contrato.'),
    'contract_signed_locador': ('contract', 'Locador assinou o contrato', 'A assinatura do locador foi registrada no contrato.'),
    'amendment_proposed': ('contract', 'Alteração de datas solicitada', 'Confira as novas datas propostas. O período atual continua valendo até o aceite da outra parte.'),
    'amendment_accepted': ('contract', 'Alteração de datas aceita', 'As datas foram alteradas sem mudança de preço. As duas partes precisam assinar a nova revisão.'),
    'amendment_rejected': ('contract', 'Alteração de datas recusada', 'A proposta foi recusada. O contrato e as datas anteriores continuam valendo.'),
    'amendment_withdrawn': ('contract', 'Solicitação retirada', 'Quem propôs retirou a solicitação. As datas não mudaram.'),
    'amendment_expired': ('contract', 'Solicitação expirada', 'O prazo para responder à alteração de datas terminou.'),
    'refund_pending': ('payment', 'Estorno em processamento', 'O cancelamento foi confirmado. O estorno está em processamento.'),
    'refund_succeeded': ('payment', 'Estorno concluído', 'O provedor confirmou o estorno. O prazo de crédito depende do meio de pagamento.'),
    'refund_failed': ('payment', 'Estorno falhou', 'A reserva continua cancelada. O estorno será conciliado pela plataforma.'),
    'contract_completed': ('contract', 'Contrato assinado pelas duas partes', 'As duas assinaturas foram registradas. O contrato está concluído e disponível para consulta.'),
}


@transaction.atomic
def notify_rental_event(rental, event, *, event_key, contract=None, detail=None):
    kind, title, message = EVENTS[event]
    if detail:
        message = f'{message} {detail}'
    machine = rental.postings.machinery
    machine_name = ' '.join(filter(None, [machine.brand, machine.model])) or 'Maquinário'
    reference = str(rental.pk)[:8].upper()
    message = f'{machine_name} · Reserva #{reference}. {message}'
    if contract is None:
        # One-to-one reverse access raises RelatedObjectDoesNotExist when absent.
        contract = getattr(rental, 'contracts', None)
    rows = []
    for recipient_id in sorted({rental.lessee_id, machine.owner_id}, key=str):
        notification, _ = Notification.objects.get_or_create(
            recipient_id=recipient_id, event_key=event_key,
            defaults={'kind': kind, 'title': title, 'message': message,
                      'rental': rental, 'posting_id': rental.postings_id, 'contract': contract},
        )
        rows.append(notification)
    return rows
