from django.db import models


class PaymentStatus(models.TextChoices):
    PENDING = "pending", "Pendente"
    APPROVED = "approved", "Aprovado"
    EXPIRED = "expired", "Expirado"
    REQUIRES_REVIEW = "requires_review", "Requer revisão"
