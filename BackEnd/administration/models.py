import uuid

from django.db import models


class PostingModeration(models.Model):
    """Histórico de moderação de anúncios de locação (RF17).

    Cada análise feita por um administrador (aprovação ou reprovação) gera
    um registro aqui, preservando o motivo informado nas reprovações.
    """

    ACTION_APPROVED = "approved"
    ACTION_REJECTED = "rejected"
    ACTION_CHOICES = [
        (ACTION_APPROVED, "Aprovado"),
        (ACTION_REJECTED, "Reprovado"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    posting = models.ForeignKey(
        "postings.Postings",
        on_delete=models.CASCADE,
        related_name="moderations",
    )
    moderator = models.ForeignKey(
        "users.Users",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="posting_moderations",
    )
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    reason = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "posting_moderations"
        ordering = ["-created_at"]
