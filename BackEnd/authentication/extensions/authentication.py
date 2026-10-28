from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed, InvalidToken
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import Token

from users.enums import DISABLED_STATUSES
from users.models import Users


class AppJWTAuthentication(JWTAuthentication):
    """Resolve o usuário autenticado a partir do model `Users` da plataforma.

    Só `get_user()` é sobrescrito; a leitura do header e a validação do token
    continuam as do SimpleJWT.
    """

    # O SimpleJWT anota o retorno com um TypeVar restrito a AbstractBaseUser |
    # TokenUser; `Users` é um AbstractBaseUser, mas o mypy não aceita o override.
    def get_user(self, validated_token: Token) -> Users:  # type: ignore[override]
        try:
            user_id = validated_token[api_settings.USER_ID_CLAIM]
        except KeyError as exc:
            raise InvalidToken("Token sem identificação de usuário.") from exc

        try:
            user = Users.objects.get(id=user_id)
        except Users.DoesNotExist as exc:
            raise AuthenticationFailed("Usuário não encontrado.", code="user_not_found") from exc

        if user.status in DISABLED_STATUSES:
            raise AuthenticationFailed("Conta suspensa ou banida.", code="user_inactive")

        return user
