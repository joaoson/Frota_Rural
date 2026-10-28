from django.db import models


class LicenseCategory(models.TextChoices):
    A = "A", "A"
    B = "B", "B"
    C = "C", "C"
    D = "D", "D"
    E = "E", "E"
    AB = "AB", "AB"
    AC = "AC", "AC"
    AD = "AD", "AD"
    AE = "AE", "AE"


class LicenseSituation(models.TextChoices):
    ACTIVE = "active", "Ativa"
    EXPIRED = "expired", "Vencida"
    SUSPENDED = "suspended", "Suspensa"
    REVOKED = "revoked", "Cassada"
    BLOCKED = "blocked", "Bloqueada"
    PPD = "ppd", "Permissão para dirigir"


class ValidationStatus(models.TextChoices):
    """Situação da análise de um documento, incluindo a inicial (`pending`)."""

    PENDING = "pending", "Pendente"
    APPROVED = "approved", "Aprovado"
    REJECTED = "rejected", "Rejeitado"


class ReviewDecision(models.TextChoices):
    """Decisão do administrador. Sem `pending`: a análise sempre é concluída."""

    APPROVED = ValidationStatus.APPROVED.value, "Aprovado"
    REJECTED = ValidationStatus.REJECTED.value, "Rejeitado"
