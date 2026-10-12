from typing import Any

from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from users.enums import UserRole
from users.models import Users

EMAIL_IN_USE_MESSAGE = "Este e-mail já está em uso."
DOCUMENT_IN_USE_MESSAGE = "Este documento já está cadastrado."

# Mensagens do validador de unicidade em PT-BR; o padrão do DRF é em inglês.
UNIQUE_FIELD_KWARGS: dict[str, dict[str, Any]] = {
    "email": {
        "validators": [UniqueValidator(queryset=Users.objects.all(), message=EMAIL_IN_USE_MESSAGE)]
    },
    "document": {
        "validators": [
            UniqueValidator(queryset=Users.objects.all(), message=DOCUMENT_IN_USE_MESSAGE)
        ]
    },
}

PROFILE_FIELDS = [
    "name",
    "document",
    "email",
    "phone",
    "address",
    "city",
    "state",
    "cep",
    "birth_date",
]

# Papéis que o cadastro público aceita. `admin` só nasce por fora da API.
SELF_SIGNUP_ROLES = [
    (role.value, role.label) for role in (UserRole.LESSOR, UserRole.LESSEE, UserRole.OPERATOR)
]


# --- Entrada ----------------------------------------------------------------


class UserCreateInputSerializer(serializers.ModelSerializer[Users]):
    """Cadastro público de conta."""

    role = serializers.ChoiceField(choices=SELF_SIGNUP_ROLES)
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    class Meta:
        model = Users
        fields = [*PROFILE_FIELDS, "role", "password"]
        extra_kwargs = UNIQUE_FIELD_KWARGS


class UserUpdateInputSerializer(serializers.ModelSerializer[Users]):
    """Dados de perfil editáveis pelo próprio usuário.

    Papel, status, vínculo e senha ficam de fora: cada um tem fluxo próprio
    (moderação, equipe de operadores, troca de senha).
    """

    class Meta:
        model = Users
        fields = PROFILE_FIELDS
        extra_kwargs = UNIQUE_FIELD_KWARGS


class ChangePasswordInputSerializer(serializers.Serializer[Any]):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(min_length=8, write_only=True)


class OperatorCreateInputSerializer(serializers.ModelSerializer[Users]):
    """Cadastro de operador feito de dentro do painel do empregador.

    A senha inicial é definida por quem cadastra e repassada ao operador — não
    há fluxo de convite por e-mail na plataforma ainda. Papel e vínculo não
    estão aqui: o servidor fixa os dois.
    """

    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = Users
        fields = [*PROFILE_FIELDS, "password"]
        extra_kwargs = UNIQUE_FIELD_KWARGS


class OperatorUpdateInputSerializer(serializers.ModelSerializer[Users]):
    class Meta:
        model = Users
        fields = PROFILE_FIELDS
        extra_kwargs = UNIQUE_FIELD_KWARGS


# --- Saída ------------------------------------------------------------------


class UserOutputSerializer(serializers.ModelSerializer[Users]):
    class Meta:
        model = Users
        fields = [
            "id",
            "name",
            "document",
            "email",
            "phone",
            "role",
            "address",
            "city",
            "state",
            "cep",
            "birth_date",
            "status",
            "employer",
            "last_login",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class OperatorOutputSerializer(serializers.ModelSerializer[Users]):
    """Operador como o empregador que o cadastrou enxerga (sem `role` nem `employer`)."""

    class Meta:
        model = Users
        fields = ["id", *PROFILE_FIELDS, "status", "created_at", "updated_at"]
        read_only_fields = fields
