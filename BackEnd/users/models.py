import uuid
from typing import TYPE_CHECKING, Any

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager
from django.db import models

from users.enums import UserRole, UserStatus

# `BaseUserManager` é genérico só nos stubs; em runtime a classe não aceita
# subscrição, e este módulo é importado antes do monkeypatch do `common`.
if TYPE_CHECKING:
    _UsersManagerBase = BaseUserManager["Users"]
else:
    _UsersManagerBase = BaseUserManager


class UsersManager(_UsersManagerBase):
    def create_user(self, email: str, password: str | None = None, **extra_fields: Any) -> "Users":
        if not email:
            raise ValueError("Email is required")
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user


class FuncaoOperador(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=60, unique=True)

    class Meta:
        db_table = "funcoes_operador"
        ordering = ["nome"]

    def __str__(self) -> str:
        return self.nome


class PortePropriedade(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=60, unique=True)

    class Meta:
        db_table = "portes_propriedade"
        ordering = ["nome"]

    def __str__(self) -> str:
        return self.nome


class Users(AbstractBaseUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    document = models.CharField(unique=True, max_length=20)
    email = models.CharField(unique=True, max_length=255)
    # password field provided by AbstractBaseUser
    phone = models.CharField(max_length=20, blank=True, null=True)
    # Caminho no bucket; a URL pública é montada pelo serializer.
    profile_photo = models.CharField(max_length=500, blank=True, null=True)
    role = models.TextField(choices=UserRole.choices)
    address = models.TextField()
    # Município e UF chegam do cadastro em campos próprios; o contrato depende
    # deles e antes só conseguia adivinhá-los relendo o texto livre de address.
    city = models.CharField(max_length=100, blank=True, null=True)
    state = models.CharField(max_length=2, blank=True, null=True)
    cep = models.CharField(max_length=9, blank=True, null=True)
    birth_date = models.DateField()
    status = models.CharField(max_length=50, choices=UserStatus.choices, blank=True, null=True)
    # Operadores cadastrados de dentro do painel pertencem a quem os criou.
    # Sem esse vínculo o locatário não teria como listar "os seus" operadores:
    # a tabela users é global e o papel sozinho não diz de quem é a equipe.
    employer = models.ForeignKey(
        "self",
        models.SET_NULL,
        blank=True,
        null=True,
        related_name="operators",
        db_column="employer_id",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    porte_propriedade = models.ForeignKey(PortePropriedade, models.PROTECT, blank=True, null=True)
    funcao_operador = models.ForeignKey(FuncaoOperador, models.PROTECT, blank=True, null=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["name", "document", "role", "address", "birth_date"]
    objects = UsersManager()

    class Meta:
        db_table = "users"

    def __str__(self) -> str:
        return f"{self.name} <{self.email}>"
