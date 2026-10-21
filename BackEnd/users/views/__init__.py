from users.views.operators import OperatorDetailView, OperatorListView
from users.views.photos import UserPhotoUploadView
from users.views.users import (
    UserByEmailView,
    UserChangePasswordView,
    UserCreateView,
    UserDetailView,
    UserListView,
)

__all__ = [
    "OperatorDetailView",
    "OperatorListView",
    "UserByEmailView",
    "UserChangePasswordView",
    "UserCreateView",
    "UserDetailView",
    "UserListView",
    "UserPhotoUploadView",
]
