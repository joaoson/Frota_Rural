from django.db import models


class PaymentStatus(models.TextChoices):
    # Tentativa gravada antes de chamar o Stripe; a sessão ainda pode não existir.
    CREATING = "creating", "Criando sessão de pagamento"
    PENDING = "pending", "Pendente"
    APPROVED = "approved", "Aprovado"
    EXPIRED = "expired", "Expirado"
    REQUIRES_REVIEW = "requires_review", "Requer revisão"
    # O Stripe recusou a criação da sessão: nenhuma cobrança existe.
    FAILED = "failed", "Falhou"


# Pagamentos que travam cancelamento e troca de datas: dinheiro pode ter entrado.
# Uma tentativa ainda em criação não trava: o locatário nunca recebeu o link.
OPEN_PAYMENT_STATUSES = (PaymentStatus.PENDING, PaymentStatus.APPROVED, PaymentStatus.REQUIRES_REVIEW)
# O que o locatário acompanha; tentativas sem sessão são detalhe interno.
VISIBLE_PAYMENT_STATUSES = (*OPEN_PAYMENT_STATUSES, PaymentStatus.EXPIRED)
