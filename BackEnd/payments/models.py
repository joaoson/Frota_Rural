import uuid

from django.db import models


class Payments(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rental = models.ForeignKey('api.Rentals', models.CASCADE, related_name='payments')
    session_id = models.CharField(max_length=255, unique=True)
    status = models.CharField(max_length=32, default='pending')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'payments'

    def __str__(self):
        return f'{self.session_id} ({self.status})'
