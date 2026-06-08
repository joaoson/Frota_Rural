from django.urls import path
from .views import (
    create_user,
    get_users,
    get_user_by_email,
    user_detail,
    change_password
)

urlpatterns = [
    path('users/create', create_user, name='create_user'),
    path('users/', get_users, name='get_users'),
    path('users/email/<str:email>', get_user_by_email, name='get_user_by_email'),
    path('users/<uuid:pk>', user_detail, name='user_detail'),
    path('users/<uuid:pk>/change-password', change_password, name='change_password'),
]