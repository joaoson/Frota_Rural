import uuid

from django.db import models


class Notification(models.Model):
    class Kind(models.TextChoices):
        RENTAL = 'rental', 'Locação'
        PAYMENT = 'payment', 'Pagamento'
        CONTRACT = 'contract', 'Contrato'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey('users.Users', models.CASCADE, related_name='notifications')
    kind = models.CharField(max_length=12, choices=Kind.choices)
    title = models.CharField(max_length=160)
    message = models.TextField()
    rental = models.ForeignKey('rentals.Rentals', models.SET_NULL, null=True, blank=True)
    posting = models.ForeignKey('postings.Postings', models.SET_NULL, null=True, blank=True)
    contract = models.ForeignKey('contracts.Contracts', models.SET_NULL, null=True, blank=True)
    event_key = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)
    dismissed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at', '-id']
        constraints = [
            models.UniqueConstraint(fields=['recipient', 'event_key'], name='notification_recipient_event_unique'),
        ]
        indexes = [
            models.Index(fields=['recipient', 'dismissed_at', '-created_at'], name='notification_inbox_idx'),
            models.Index(fields=['recipient', 'dismissed_at', 'read_at'], name='notification_unread_idx'),
        ]
