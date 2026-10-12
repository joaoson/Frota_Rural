from django.db import models


class UserRole(models.TextChoices):
    LESSOR = "locador", "Locador"
    LESSEE = "locatario", "Locatário"
    OPERATOR = "operador", "Operador"
    ADMIN = "admin", "Administrador"


class UserStatus(models.TextChoices):
    ACTIVE = "active", "Ativo"
    WARNED = "warned", "Advertido"
    SUSPENDED = "suspended", "Suspenso"
    BANNED = "banned", "Banido"


# Contas que não podem autenticar nem abrir cadastro novo com o mesmo documento.
DISABLED_STATUSES = (UserStatus.SUSPENDED, UserStatus.BANNED)
