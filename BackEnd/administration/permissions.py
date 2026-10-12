from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView

from users.enums import UserRole


class IsPlatformAdmin(BasePermission):
    """Só usuários com role `admin`.

    Os endpoints administrativos antigos (advertir, suspender, banir, aprovar e
    reprovar anúncio) continuam sem permission_class — não foram retrofitados
    aqui de propósito, para não mudar o comportamento atual do painel. Fica
    como dívida registrada.
    """

    message = "Acesso restrito a administradores."

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = getattr(request, "user", None)
        return bool(
            user
            and getattr(user, "is_authenticated", False)
            and getattr(user, "role", None) == UserRole.ADMIN
        )
