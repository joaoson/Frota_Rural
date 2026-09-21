from rest_framework.permissions import BasePermission


class IsPlatformAdmin(BasePermission):
    """Only authenticated platform administrators may moderate accounts and content."""

    message = 'Acesso restrito a administradores.'

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        return bool(
            user and getattr(user, 'is_authenticated', False)
            and getattr(user, 'role', None) == 'admin'
        )
