import hashlib
import logging
import secrets
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from authentication.emailing.email import send_password_reset_email
from authentication.models import PasswordResets
from authentication.serializer import (
    LoginInputSerializer,
    PasswordResetConfirmInputSerializer,
    PasswordResetRequestInputSerializer,
)
from common.exceptions import BadGateway, Unauthorized
from users.enums import DISABLED_STATUSES
from users.models import Users

logger = logging.getLogger(__name__)

SESSION_EXPIRED_MESSAGE = "Sessão expirada. Faça login novamente."


@dataclass(frozen=True)
class TokenPair:
    access: str
    refresh: str


class AuthService:
    @staticmethod
    def login(data: Mapping[str, Any]) -> TokenPair:
        serializer = LoginInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        email: str = serializer.validated_data["email"]
        password: str = serializer.validated_data["password"]

        user = Users.objects.filter(email=email).first()
        # Mesma resposta para e-mail inexistente e senha errada: não revela
        # quais e-mails têm conta.
        if user is None or not user.check_password(password):
            raise Unauthorized("E-mail ou senha inválidos.", code="invalid_credentials")
        if user.status in DISABLED_STATUSES:
            raise PermissionDenied("Conta suspensa ou banida.", code="account_disabled")

        refresh = RefreshToken.for_user(user)
        refresh["email"] = user.email
        refresh["role"] = user.role
        return TokenPair(access=str(refresh.access_token), refresh=str(refresh))

    @staticmethod
    def refresh(raw_refresh_token: str | None) -> str:
        """Novo access token a partir do refresh token guardado no cookie."""
        if not raw_refresh_token:
            raise Unauthorized(SESSION_EXPIRED_MESSAGE, code="missing_refresh_token")
        try:
            refresh = RefreshToken(raw_refresh_token)  # type: ignore[arg-type]
        except TokenError as exc:
            raise Unauthorized(SESSION_EXPIRED_MESSAGE, code="invalid_refresh_token") from exc
        return str(refresh.access_token)


class PasswordResetService:
    @staticmethod
    def _hash(raw_token: str) -> str:
        return hashlib.sha256(raw_token.encode()).hexdigest()

    @staticmethod
    @transaction.atomic
    def request_reset(data: Mapping[str, Any]) -> None:
        """Gera o token de recuperação e o envia por e-mail.

        Não levanta nada para e-mail sem conta: a resposta precisa ser a mesma
        nos dois casos. Se o envio falha, o token gravado é desfeito junto.
        """
        serializer = PasswordResetRequestInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)

        user = Users.objects.filter(email=serializer.validated_data["email"]).first()
        if user is None:
            return

        # Só o pedido mais recente vale.
        PasswordResets.objects.filter(user=user, used=False).update(used=True)

        raw_token = secrets.token_urlsafe(32)
        PasswordResets.objects.create(
            user=user,
            token_hash=PasswordResetService._hash(raw_token),
            expires_at=timezone.now() + timedelta(seconds=settings.PASSWORD_RESET_TIMEOUT),
        )

        try:
            send_password_reset_email(user.email, raw_token)
        except Exception as exc:
            raise BadGateway("Não foi possível enviar o e-mail. Tente novamente.") from exc

        if settings.DEBUG:
            # Sem Resend configurado em desenvolvimento, é daqui que se pega o token.
            logger.warning("[PASSWORD RESET] Token gerado em DEBUG: %s", raw_token)

    @staticmethod
    @transaction.atomic
    def confirm_reset(data: Mapping[str, Any]) -> None:
        """Troca a senha com o token recebido por e-mail (uso único, com prazo)."""
        serializer = PasswordResetConfirmInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)

        reset = (
            PasswordResets.objects.select_for_update(of=("self",))
            .select_related("user")
            .filter(
                token_hash=PasswordResetService._hash(serializer.validated_data["token"]),
                used=False,
                expires_at__gt=timezone.now(),
            )
            .first()
        )
        if reset is None:
            raise ValidationError("Token inválido, expirado ou já utilizado.")

        user = reset.user
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])

        reset.used = True
        reset.save(update_fields=["used"])
