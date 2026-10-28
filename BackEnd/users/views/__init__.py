from users.views.operators import FuncaoOperadorListView, OperatorDetailView, OperatorListView
from users.views.photos import UserPhotoUploadView
from users.views.users import (
    PortePropriedadeListView,
    UserByEmailView,
    UserChangePasswordView,
    UserCreateView,
    UserDetailView,
    UserListView,
)

__all__ = [
    "FuncaoOperadorListView",
    "OperatorDetailView",
    "OperatorListView",
    "PortePropriedadeListView",
    "UserByEmailView",
    "UserChangePasswordView",
    "UserCreateView",
    "UserDetailView",
    "UserListView",
    "UserPhotoUploadView",
]
