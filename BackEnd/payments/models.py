import uuid

from django.db import models

from payments.enums import PaymentStatus


class Payments(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rental = models.ForeignKey("rentals.Rentals", models.CASCADE, related_name="payments")
    # Nula enquanto a tentativa não tem sessão confirmada pelo Stripe.
    session_id = models.CharField(max_length=255, unique=True, blank=True, null=True)
    status = models.CharField(
        max_length=32, choices=PaymentStatus.choices, default=PaymentStatus.PENDING
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    # Tentativa durável (plano, passo 2.1): a chave e os parâmetros são gravados
    # antes da chamada, e repetir a mesma chave devolve a mesma sessão do Stripe.
    idempotency_key = models.CharField(max_length=255, unique=True, blank=True, null=True)
    provider_request = models.JSONField(blank=True, null=True)
    payment_intent_id = models.CharField(max_length=255, blank=True, default="")
    last_error = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payments"

    def __str__(self) -> str:
        return f"{self.session_id or self.idempotency_key} ({self.status})"


class PaymentEvents(models.Model):
    """Eventos do Stripe recebidos pelo webhook: deduplicação e trilha de auditoria."""

    id = models.CharField(primary_key=True, max_length=255)  # id do evento no Stripe
    type = models.CharField(max_length=100)
    session_id = models.CharField(max_length=255, blank=True, default="")
    received_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(blank=True, null=True)
    attempts = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True, default="")

    class Meta:
        db_table = "payment_events"
        ordering = ["received_at"]

    def __str__(self) -> str:
        return f"{self.type} {self.id}"
