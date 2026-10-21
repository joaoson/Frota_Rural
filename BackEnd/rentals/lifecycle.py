"""Uma única leitura do ciclo de vida da locação (passo 4.2 do plano).

`status` é o estado gravado; `phase` é o que ele significa para as pessoas
(reservada, em uso, aguardando conclusão...) e `allowed_actions` diz o que cada
parte pode fazer agora. Disponibilidade, assinatura, pagamento e as duas telas de
painel leem daqui, em vez de cada uma manter a própria lista de status.
"""

from datetime import datetime

from django.db import models
from django.utils import timezone

from payments.enums import OPEN_PAYMENT_STATUSES
from rentals.enums import RentalStatus

# Ocupam a máquina até o fim do período.
OCCUPYING = (RentalStatus.ACTIVE, RentalStatus.SIGNED, RentalStatus.COMPLETED, RentalStatus.CLOSED)
# Reservas ainda não pagas: seguram as datas só enquanto a retenção vale.
PROVISIONAL = (RentalStatus.PENDING, RentalStatus.AWAITING_PAYMENT)
# Pagas e ainda não encerradas.
PAID = (RentalStatus.ACTIVE, RentalStatus.SIGNED)
FINISHED = (RentalStatus.COMPLETED, RentalStatus.CLOSED)


class RentalPhase(models.TextChoices):
    RESERVA = "reserva", "Reserva pendente"
    AGUARDANDO_PAGAMENTO = "aguardando_pagamento", "Aguardando pagamento"
    AGUARDANDO_ASSINATURAS = "aguardando_assinaturas", "Aguardando assinaturas"
    PRONTA_PARA_ENTREGA = "pronta_para_entrega", "Pronta para entrega"
    EM_USO = "em_uso", "Em uso"
    DEVOLVIDA = "devolvida", "Aguardando conclusão"
    CONCLUIDA = "concluida", "Concluída"
    CANCELADA = "cancelada", "Cancelada"


def phase(rental, now: datetime | None = None) -> RentalPhase:
    now = now or timezone.now()
    status = rental.status
    if status == RentalStatus.CANCELLED:
        return RentalPhase.CANCELADA
    if status in FINISHED:
        return RentalPhase.CONCLUIDA
    if status == RentalStatus.AWAITING_PAYMENT:
        return RentalPhase.AGUARDANDO_PAGAMENTO
    if status == RentalStatus.ACTIVE:
        return RentalPhase.AGUARDANDO_ASSINATURAS
    if status == RentalStatus.SIGNED:
        # A leitura de devolução ou o fim do período encerram o uso; falta o locador concluir.
        if rental.final_hour_meter is not None or rental.end_date <= now:
            return RentalPhase.DEVOLVIDA
        if rental.initial_hour_meter is not None or rental.start_date <= now:
            return RentalPhase.EM_USO
        return RentalPhase.PRONTA_PARA_ENTREGA
    return RentalPhase.RESERVA


def _contract(rental):
    try:
        return rental.contracts
    except models.ObjectDoesNotExist:
        return None


def allowed_actions(rental, user, now: datetime | None = None) -> list[str]:
    """O que `user` pode fazer agora nesta locação. Lê `payments` prefetchado."""
    if user is None or not getattr(user, "pk", None):
        return []
    now = now or timezone.now()
    is_lessee = user.pk == rental.lessee_id
    is_owner = user.pk == rental.postings.machinery.owner_id
    payments = [payment.status for payment in rental.payments.all()]
    # Uma tentativa sem sessão (ou recusada) não trava: o locatário nunca teve o link.
    open_payment = any(status in OPEN_PAYMENT_STATUSES for status in payments)
    actions: list[str] = []

    if rental.status in PROVISIONAL:
        if is_lessee and rental.start_date > now and not {"approved", "requires_review"} & set(payments):
            actions.append("pay")
        if rental.status == RentalStatus.PENDING and not open_payment:
            if is_lessee or is_owner:
                actions.append("cancel")
            if is_lessee:
                actions.append("edit_dates")

    contract = _contract(rental)
    if rental.status in PAID and contract is not None and contract.status == "pending_signatures":
        if (is_lessee and not contract.accepted_by_lessee) or (is_owner and not contract.accepted_by_lessor):
            actions.append("sign")

    if rental.status == RentalStatus.SIGNED and is_owner:
        if now.date() >= rental.start_date.date():
            actions.append("record_check_in")
            if rental.initial_hour_meter is not None:
                actions.append("record_check_out")
        if rental.end_date <= now:
            actions.append("complete")

    if rental.status in FINISHED and (is_lessee or is_owner):
        actions.append("review")
    return actions
