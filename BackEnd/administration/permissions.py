from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView

from users.enums import UserRole


class IsPlatformAdmin(BasePermission):
    """Only authenticated platform administrators may moderate users and content."""

    message = "Acesso restrito a administradores."

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = getattr(request, "user", None)
        return bool(
            user
            and getattr(user, "is_authenticated", False)
            and getattr(user, "role", None) == UserRole.ADMIN
        )
