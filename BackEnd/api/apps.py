from django.apps import AppConfig


class ApiConfig(AppConfig):
    """App legado, sem models, views ou urls.

    Continua instalado só por causa do histórico de migrações: contracts, chat
    e payments dependem de `api.000x`, e remover o app quebraria o grafo em
    todo banco já migrado. O código que vivia aqui foi distribuído entre os
    apps `rentals`, `reviews`, `contracts` e `chat`.
    """

    name = "api"
