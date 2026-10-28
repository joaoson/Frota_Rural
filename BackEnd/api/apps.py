from django.apps import AppConfig


class ApiConfig(AppConfig):
    """Histórico legado e programação de recorrências.

    Contracts, chat e payments dependem de `api.000x`; remover o app quebraria
    bancos já migrados. Rentals e Reviews vivem nos respectivos apps de domínio.
    RentalRecurrence mantém sua identidade de migração neste app; suas rotas
    são expostas pelo app rentals.
    """

    name = "api"
