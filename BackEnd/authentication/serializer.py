from rest_framework import serializers

class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={'input_type': 'password'})


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(min_length=8)

class AccessTokenSerializer(serializers.Serializer):
    """Token de acesso devolvido no login e na renovação."""

    access = serializers.CharField(
        help_text='JWT de acesso, válido por 15 minutos. Envie em `Authorization: Bearer <token>`.'
    )


class DetailResponseSerializer(serializers.Serializer):
    """Mensagem curta de status devolvida pelos endpoints de autenticação."""

    detail = serializers.CharField()


class PasswordResetMessageSerializer(serializers.Serializer):
    """Resposta neutra do pedido de redefinição, idêntica exista ou não a conta."""

    message = serializers.CharField()
