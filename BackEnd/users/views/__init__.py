from users.views.operators import OperatorDetailView, OperatorListView
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
