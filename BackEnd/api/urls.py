from django.urls import path
from rest_framework_simplejwt.views import TokenVerifyView

from .views import (
    machine_detail,
    machines_list,
    suspend_user,
    warn_user,
    ban_user,
)

urlpatterns = [
    ## USERS
    path('admin/users/<uuid:pk>/warn', warn_user, name='warn_user'),
    path('admin/users/<uuid:pk>/suspend', suspend_user, name='suspend_user'),
    path('admin/users/<uuid:pk>/ban', ban_user, name='ban_user'),
    path('machines/', machines_list, name='machines_list'),
    path('machines/<uuid:pk>', machine_detail, name='machine_detail'),
]