from django.urls import path
from rest_framework_simplejwt.views import TokenVerifyView
from .views import (
    login,
    logout,
    refresh_token,
    request_password_reset,
    confirm_password_reset
)

urlpatterns = [
    ## JWT AUTH
    path('login', login, name='token_obtain_pair'),
    path('login/refresh', refresh_token, name='token_refresh'),
    path('login/verify', TokenVerifyView.as_view(), name='token_verify'),
    path('logout', logout, name='logout'),

    ## PASSWORD RESET
    path('password-reset/request', request_password_reset, name='password_reset_request'),
    path('password-reset/confirm', confirm_password_reset, name='password_reset_confirm'),
]