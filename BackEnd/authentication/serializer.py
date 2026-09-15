from typing import Any

from rest_framework import serializers

# --- Entrada ----------------------------------------------------------------


class LoginInputSerializer(serializers.Serializer[Any]):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})


class PasswordResetRequestInputSerializer(serializers.Serializer[Any]):
    email = serializers.EmailField()


class PasswordResetConfirmInputSerializer(serializers.Serializer[Any]):
    token = serializers.CharField(help_text="Token recebido por e-mail.")
    new_password = serializers.CharField(min_length=8, write_only=True)


# --- Saída ------------------------------------------------------------------


class AccessTokenOutputSerializer(serializers.Serializer[Any]):
    """Token de acesso devolvido no login e na renovação."""

    access = serializers.CharField(
        help_text="JWT de acesso, válido por 15 minutos. Envie em `Authorization: Bearer <token>`."
    )
