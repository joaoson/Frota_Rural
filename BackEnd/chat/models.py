import uuid

from django.db import models
from django.db.models import Q
from django.utils import timezone


class Messages(models.Model):
    """Uma mensagem 1:1.

    O escopo da conversa é derivado: a mensagem pertence *ou* a uma locação
    (`rental`) *ou* a uma consulta sobre um anúncio feita antes de existir
    locação (`posting`). Exatamente um dos dois — garantido pela CheckConstraint
    `messages_exactly_one_scope`. Não existe tabela `conversations`: a thread é
    a tupla (escopo, id do escopo, par de participantes ordenado).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sender = models.ForeignKey('users.Users', models.DO_NOTHING)
    receiver = models.ForeignKey(
        'users.Users', models.DO_NOTHING, related_name='messages_receiver_set'
    )
    rental = models.ForeignKey('api.Rentals', models.DO_NOTHING, blank=True, null=True)
    posting = models.ForeignKey(
        'postings.Postings',
        models.DO_NOTHING,
        blank=True,
        null=True,
        db_column='posting_id',
        related_name='messages',
    )
    content = models.TextField()
    # NOT NULL com default: a paginação por keyset ordena em (sent_at, id) e
    # ficaria incorreta se sent_at pudesse ser nulo.
    sent_at = models.DateTimeField(default=timezone.now)
    read_at = models.DateTimeField(blank=True, null=True)
    hidden_at = models.DateTimeField(blank=True, null=True)
    # Idempotência de envio: o cliente gera o uuid antes de mandar, então um
    # reenvio (retry do WS ou fallback REST) não duplica a linha.
    client_id = models.UUIDField(blank=True, null=True)
    flagged_for_moderation = models.BooleanField(default=False)

    class Meta:
        db_table = 'messages'
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(rental__isnull=False, posting__isnull=True)
                    | Q(rental__isnull=True, posting__isnull=False)
                ),
                name='messages_exactly_one_scope',
            ),
            models.UniqueConstraint(
                fields=['sender', 'client_id'],
                condition=Q(client_id__isnull=False),
                name='messages_sender_client_id_uniq',
            ),
        ]
        indexes = [
            models.Index(fields=['rental', '-sent_at', '-id'], name='idx_messages_rental_thread'),
            models.Index(fields=['posting', '-sent_at', '-id'], name='idx_messages_posting_thread'),
            models.Index(fields=['sender', '-sent_at'], name='idx_messages_sender_recent'),
            models.Index(fields=['receiver', '-sent_at'], name='idx_messages_receiver_recent'),
            models.Index(
                fields=['receiver'],
                name='idx_messages_unread',
                condition=Q(read_at__isnull=True),
            ),
            models.Index(
                fields=['-sent_at'],
                name='idx_messages_flagged',
                condition=Q(flagged_for_moderation=True),
            ),
        ]

    @property
    def hidden(self):
        return self.hidden_at is not None


class MessageReports(models.Model):
    """Denúncia feita por um participante + a decisão da moderação na mesma linha.

    Espelha o precedente de `administration.PostingModeration`, mas registra a
    denúncia do *usuário* (e sua resolução), não a decisão administrativa avulsa.
    """

    RESOLUTION_DISMISSED = 'dismissed'
    RESOLUTION_UPHELD = 'upheld'
    RESOLUTION_CHOICES = [
        (RESOLUTION_DISMISSED, 'Arquivada'),
        (RESOLUTION_UPHELD, 'Procedente'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.ForeignKey(Messages, models.CASCADE, related_name='reports')
    reported_by = models.ForeignKey(
        'users.Users', models.SET_NULL, blank=True, null=True, related_name='message_reports'
    )
    reason = models.TextField()
    resolution = models.CharField(
        max_length=20, choices=RESOLUTION_CHOICES, blank=True, null=True
    )
    resolution_note = models.TextField(blank=True, null=True)
    resolved_by = models.ForeignKey(
        'users.Users',
        models.SET_NULL,
        blank=True,
        null=True,
        related_name='message_report_resolutions',
    )
    resolved_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'message_reports'
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['message', 'reported_by'], name='message_reports_unique_reporter'
            ),
        ]
