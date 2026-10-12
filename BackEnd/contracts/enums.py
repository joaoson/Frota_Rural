from django.db import models


class ContractStatus(models.TextChoices):
    PENDING_SIGNATURES = "pending_signatures", "Aguardando assinaturas"
    SIGNED = "signed", "Assinado"
    CANCELLED = "cancelled", "Cancelado"


class SignatureRole(models.TextChoices):
    """Parte que aceita o contrato. Os valores são os mesmos do `UserRole`."""

    LESSOR = "locador", "Locador (dono do maquinário)"
    LESSEE = "locatario", "Locatário (produtor que aluga)"
