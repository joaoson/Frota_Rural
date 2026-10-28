"""Autenticação da conexão WebSocket via subprotocolo `Sec-WebSocket-Protocol`.

O token nunca aparece em query string nem em cookie (ver §3.3 do plano): o
cliente conecta com `new WebSocket(url, ["bearer", accessToken])` e o servidor
lê `scope["subprotocols"][1]`.

Reaproveita `AppJWTAuthentication` tal como o DRF usa por HTTP — não decodifica
o JWT nem instancia `AccessToken` diretamente, para não perder a checagem de
usuário suspenso/banido feita em `get_user()`.
"""

from collections.abc import Awaitable, Callable, MutableMapping
from typing import Any

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.exceptions import AuthenticationFailed, InvalidToken, TokenError

from authentication.extensions.authentication import AppJWTAuthentication
from users.models import Users

type Scope = MutableMapping[str, Any]
type Receive = Callable[[], Awaitable[dict[str, Any]]]
type Send = Callable[[dict[str, Any]], Awaitable[None]]


class JWTAuthMiddleware(BaseMiddleware):
    """Popula `scope["user"]` a partir do token levado no subprotocolo `bearer`."""

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> object:
        subprotocols = scope.get("subprotocols") or []
        token = None
        if len(subprotocols) == 2 and subprotocols[0] == "bearer":  # noqa: PLR2004
            token = subprotocols[1]

        user: Users | None = None
        if token:
            user = await database_sync_to_async(self._authenticate)(token)
        else:
            scope["auth_error"] = "missing_token"

        scope["user"] = user or AnonymousUser()
        return await super().__call__(scope, receive, send)

    @staticmethod
    def _authenticate(token: str) -> Users | None:
        auth = AppJWTAuthentication()
        try:
            validated_token = auth.get_validated_token(token.encode())
            return auth.get_user(validated_token)
        except (InvalidToken, AuthenticationFailed, TokenError):
            return None
