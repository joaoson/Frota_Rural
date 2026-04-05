from django.urls import path
from .views import get_users, create_user, user_detail, get_user_by_email

urlpatterns = [
    path('users/create', create_user, name='create_user'),
    path('users/', get_users, name='get_users'),
    path('users/email/<str:email>', get_user_by_email, name='get_user_by_email'),
    path('users/<uuid:pk>', user_detail, name='user_detail'),
]