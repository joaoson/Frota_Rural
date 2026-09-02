from rest_framework.permissions import BasePermission


class IsPlatformAdmin(BasePermission):
    """Só usuários com role 'admin'.

    Os endpoints administrativos antigos continuam sem permission_class — não
    foram retrofitados aqui de propósito, para não mudar o comportamento atual
    do painel. Fica como dívida registrada.
    """

    message = 'Acesso restrito a administradores.'

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        return bool(
            user and getattr(user, 'is_authenticated', False)
            and getattr(user, 'role', None) == 'admin'
        )
