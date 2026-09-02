"""
ASGI config for djangoapi project.

HTTP continua indo para o handler síncrono do Django; o WebSocket passa pelo
OriginValidator -> JWTAuthMiddleware -> URLRouter do app `chat`.
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'djangoapi.settings')

# Precisa vir antes de qualquer import que toque em models: é aqui que o
# Django carrega os apps.
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter   # noqa: E402
from channels.security.websocket import OriginValidator      # noqa: E402
from django.conf import settings                             # noqa: E402

from chat.middleware import JWTAuthMiddleware                # noqa: E402
from chat.routing import websocket_urlpatterns               # noqa: E402

# OriginValidator com CORS_ALLOWED_ORIGINS em vez de AllowedHostsOriginValidator:
# o front roda em :5173 enquanto ALLOWED_HOSTS é localhost,127.0.0.1. A lista de
# CORS já é exatamente "quais origens de browser podem falar com a gente".
application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': OriginValidator(
        JWTAuthMiddleware(URLRouter(websocket_urlpatterns)),
        settings.CORS_ALLOWED_ORIGINS,
    ),
})
