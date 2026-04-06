from django.urls import path

from .views import (
    ban_user,
    create_user,
    get_user_by_email,
    get_users,
    machine_detail,
    machines_list,
    suspend_user,
    user_detail,
    warn_user,
)

urlpatterns = [
    path('users/create', create_user, name='create_user'),
    path('users/', get_users, name='get_users'),
    path('users/email/<str:email>', get_user_by_email, name='get_user_by_email'),
    path('users/<uuid:pk>', user_detail, name='user_detail'),
    path('users/<uuid:pk>/warn', warn_user, name='warn_user'),
    path('users/<uuid:pk>/suspend', suspend_user, name='suspend_user'),
    path('users/<uuid:pk>/ban', ban_user, name='ban_user'),
    path('machines/', machines_list, name='machines_list'),
    path('machines/<uuid:pk>', machine_detail, name='machine_detail'),
]