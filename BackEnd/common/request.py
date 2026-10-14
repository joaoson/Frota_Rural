"""Acesso tipado ao usuário da requisição.

`request.user` é `AbstractBaseUser | AnonymousUser` para o mypy; as views
precisam do `Users` da plataforma para repassar aos services.
"""

from rest_framework.exceptions import NotAuthenticated
from rest_framework.request import Request

from users.models import Users


def authenticated_user(request: Request) -> Users:
    """Usuário autenticado, ou `NotAuthenticated` (401) se a requisição é anônima."""
    user = optional_user(request)
    if user is None:
        raise NotAuthenticated()
    return user


def optional_user(request: Request) -> Users | None:
    """Usuário autenticado, ou `None` para requisições anônimas."""
    user = getattr(request, "user", None)
    if isinstance(user, Users) and user.is_authenticated:
        return user
    return None
