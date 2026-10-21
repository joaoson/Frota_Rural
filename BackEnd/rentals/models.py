from django.db import models

from rentals.enums import RentalStatus


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

    def __str__(self) -> str:
        return f"Locação {self.id}"
