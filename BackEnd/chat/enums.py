from django.db import models


class ThreadScope(models.TextChoices):
    """A que uma conversa pertence: uma locação ou uma consulta sobre um anúncio."""

    RENTAL = "rental", "Locação"
    POSTING = "posting", "Anúncio"


class ReportResolution(models.TextChoices):
    DISMISSED = "dismissed", "Arquivada"
    UPHELD = "upheld", "Procedente"


class ModerationDecision(models.TextChoices):
    DISMISS = "dismiss", "Arquivar denúncia"
    HIDE = "hide", "Ocultar mensagem"
