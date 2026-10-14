import uuid

from django.db import models


class RentalRecurrence(models.Model):
    """A finite set of new reservations; never an automatic payment mandate."""

    class Frequency(models.TextChoices):
        WEEKLY = 'weekly', 'Semanal'
        BIWEEKLY = 'biweekly', 'Quinzenal'
        MONTHLY = 'monthly', 'Mensal'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source_rental = models.ForeignKey("rentals.Rentals", models.PROTECT, related_name='scheduled_recurrences')
    lessee = models.ForeignKey('users.Users', models.PROTECT)
    first_start_date = models.DateField()
    frequency = models.CharField(max_length=10, choices=Frequency.choices)
    occurrences = models.PositiveSmallIntegerField()
    idempotency_key = models.UUIDField()
    total_price = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'rental_recurrences'
        constraints = [
            models.UniqueConstraint(
                fields=['lessee', 'idempotency_key'], name='unique_lessee_recurrence_request',
            ),
            models.CheckConstraint(
                condition=models.Q(occurrences__gte=2, occurrences__lte=12),
                name='recurrence_occurrences_between_2_12',
            ),
        ]
