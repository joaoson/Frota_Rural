from django.db import models

from rentals.enums import MeterReadingKind, RentalStatus


class Rentals(models.Model):
    id = models.UUIDField(primary_key=True)
    postings = models.ForeignKey("postings.Postings", models.DO_NOTHING)
    lessee = models.ForeignKey("users.Users", models.DO_NOTHING)
    operator = models.ForeignKey(
        "users.Users",
        models.DO_NOTHING,
        related_name="rentals_operator_set",
        blank=True,
        null=True,
    )
    start_date = models.DateTimeField()
    end_date = models.DateTimeField()
    total_price = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    # Cotação congelada na reserva (ADR 0002): a tarifa atual do anúncio não
    # altera o valor acordado de uma locação existente.
    hourly_rate_snapshot = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    daily_rate = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    billable_days = models.PositiveIntegerField(blank=True, null=True)
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    platform_fee_rate = models.DecimalField(max_digits=5, decimal_places=4, blank=True, null=True)
    platform_fee = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    priced_at = models.DateTimeField(blank=True, null=True)
    # Observações do locatário para a retirada/serviço. Operacionais: não entram no contrato.
    notes = models.TextField(blank=True, default="")
    cancellation_policy_version = models.CharField(max_length=32, default="2026-10-21")
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey("users.Users", models.DO_NOTHING, related_name="+", null=True, blank=True)
    cancellation_reason = models.CharField(max_length=1000, blank=True, default="")
    # Leituras de horímetro: só métricas de uso, nunca entram no preço.
    initial_hour_meter = models.IntegerField(blank=True, null=True)
    final_hour_meter = models.IntegerField(blank=True, null=True)
    status = models.TextField(choices=RentalStatus.choices, blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    recurrence = models.ForeignKey(
        "api.RentalRecurrence", models.PROTECT, related_name="rentals", blank=True, null=True,
    )
    recurrence_index = models.PositiveSmallIntegerField(blank=True, null=True)
    reservation_expires_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = "rentals"
        constraints = [
            models.UniqueConstraint(fields=["recurrence", "recurrence_index"], name="unique_recurrence_occurrence"),
        ]
        # Índice parcial do PostgreSQL para a receita mensal do painel (`lessor_dashboard_monthly`).
        indexes = [
            models.Index(
                fields=["end_date"],
                condition=models.Q(status__in=[RentalStatus.COMPLETED, RentalStatus.CLOSED]),
                name="rentals_finished_end_idx",
            ),
        ]

    def __str__(self) -> str:
        return f"Locação {self.id}"


class RentalMeterReadings(models.Model):
    """Leitura do horímetro na retirada ou na devolução (ADR 0002: só métrica de uso).

    Uma correção grava uma nova leitura que aponta a anterior em `supersedes`; a
    mais recente de cada tipo vale e é copiada para `Rentals.initial_hour_meter` /
    `final_hour_meter`. Nada daqui entra no preço, no pagamento ou na conclusão.
    """

    id = models.UUIDField(primary_key=True)
    rental = models.ForeignKey(Rentals, models.DO_NOTHING, related_name="meter_readings")
    kind = models.CharField(max_length=20, choices=MeterReadingKind.choices)
    value = models.PositiveIntegerField()
    note = models.CharField(max_length=500, blank=True, default="")
    recorded_by = models.ForeignKey("users.Users", models.DO_NOTHING, related_name="+")
    recorded_at = models.DateTimeField()
    supersedes = models.ForeignKey("self", models.DO_NOTHING, related_name="+", blank=True, null=True)

    class Meta:
        db_table = "rental_meter_readings"
        ordering = ["recorded_at", "id"]
        indexes = [models.Index(fields=["rental", "kind", "recorded_at"])]

    def __str__(self) -> str:
        return f"{self.kind} {self.value} h ({self.rental_id})"
