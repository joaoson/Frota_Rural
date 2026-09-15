from django.db import models


class ModerationAction(models.TextChoices):
    APPROVED = "approved", "Aprovado"
    REJECTED = "rejected", "Reprovado"


class ModerationQueueStatus(models.TextChoices):
    PENDING = "pending", "Pendentes"
    RESOLVED = "resolved", "Resolvidas"
    ALL = "all", "Todas"


class ModerationQueueSource(models.TextChoices):
    REPORT = "report", "Denúncia de usuário"
    AUTO = "auto", "Palavra bloqueada"
    ALL = "all", "Todas"
