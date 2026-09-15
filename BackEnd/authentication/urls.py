from django.urls import path

from authentication.views import (
    LoginView,
    LogoutView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RefreshTokenView,
    VerifyTokenView,
)

urlpatterns = [
    # JWT
    path("login", LoginView.as_view(), name="token_obtain_pair"),
    path("login/refresh", RefreshTokenView.as_view(), name="token_refresh"),
    path("login/verify", VerifyTokenView.as_view(), name="token_verify"),
    path("logout", LogoutView.as_view(), name="logout"),
    # Redefinição de senha
    path(
        "password-reset/request", PasswordResetRequestView.as_view(), name="password_reset_request"
    ),
    path(
        "password-reset/confirm", PasswordResetConfirmView.as_view(), name="password_reset_confirm"
    ),
]
