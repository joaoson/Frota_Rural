from django.db import models


class PostingStatus(models.TextChoices):
    ACTIVE = "active", "Ativo"
    DRAFT = "draft", "Rascunho"
    INACTIVE = "inactive", "Inativo"
    SUSPENDED = "suspended", "Suspenso"
    REJECTED = "rejected", "Reprovado"
    PENDING_REVIEW = "pending_review", "Em análise"
