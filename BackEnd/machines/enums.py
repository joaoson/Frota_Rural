from django.db import models


class MachineStatus(models.TextChoices):
    ACTIVE = "active", "Ativa"
    MAINTENANCE = "maintenance", "Em manutenção"
    INACTIVE = "inactive", "Inativa"
