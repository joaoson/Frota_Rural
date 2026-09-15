from django.db import models


class RentalStatus(models.TextChoices):
    PENDING = "pending", "Pendente"
    AWAITING_PAYMENT = "awaiting_payment", "Aguardando pagamento"
    ACTIVE = "active", "Ativa"
    SIGNED = "signed", "Assinada"
    COMPLETED = "completed", "Concluída"
    CLOSED = "closed", "Encerrada"
    CANCELLED = "cancelled", "Cancelada"
