from django.urls import path
from rest_framework_simplejwt.views import TokenVerifyView

from .views import (
    suspend_user,
    warn_user,
    ban_user,
)

urlpatterns = [
    path('admin/users/<uuid:pk>/warn', warn_user, name='warn_user'),
    path('admin/users/<uuid:pk>/suspend', suspend_user, name='suspend_user'),
    path('admin/users/<uuid:pk>/ban', ban_user, name='ban_user'),
]