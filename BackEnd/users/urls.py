from django.urls import path

from users.views import (
    OperatorDetailView,
    OperatorListView,
    UserByEmailView,
    UserChangePasswordView,
    UserCreateView,
    UserDetailView,
    UserListView,
)

urlpatterns = [
    path("users/create", UserCreateView.as_view(), name="create_user"),
    path("users", UserListView.as_view(), name="get_users"),
    path("users/email/<str:email>", UserByEmailView.as_view(), name="get_user_by_email"),
    # Antes de `users/<uuid:pk>` por clareza; não há conflito porque
    # "operators" nunca casa com o conversor uuid.
    path("users/operators", OperatorListView.as_view(), name="operators"),
    path("users/operators/<uuid:pk>", OperatorDetailView.as_view(), name="operator_detail"),
    path("users/<uuid:pk>", UserDetailView.as_view(), name="user_detail"),
    path(
        "users/<uuid:pk>/change-password",
        UserChangePasswordView.as_view(),
        name="change_password",
    ),
]
