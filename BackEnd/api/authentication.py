from django.utils.translation import gettext_lazy as _
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed, InvalidToken
from rest_framework_simplejwt.settings import api_settings

from .models import Users


class AppJWTAuthentication(JWTAuthentication):
    """
    Extends JWTAuthentication to resolve the authenticated user from the
    custom `Users` model instead of Django's AUTH_USER_MODEL.

    Only get_user() is overridden; header parsing and token validation
    are inherited from the parent class unchanged.
    """

    def get_user(self, validated_token):
        try:
            user_id = validated_token[api_settings.USER_ID_CLAIM]  # 'user_id' claim
        except KeyError as exc:
            raise InvalidToken(
                _('Token contained no recognizable user identification')
            ) from exc

        try:
            user = Users.objects.get(id=user_id)
        except Users.DoesNotExist as exc:
            raise AuthenticationFailed(
                _('User not found'), code='user_not_found'
            ) from exc

        if user.status in ('suspended', 'banned'):
            raise AuthenticationFailed(
                _('User account is disabled.'), code='user_inactive'
            )

        return user
