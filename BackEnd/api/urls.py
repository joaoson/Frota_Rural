from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from .views import (
    ban_user,
    create_user,
    get_user_by_email,
    get_users,
    login,
    machine_detail,
    machines_list,
    posting_detail,
    postings_list,
    suspend_user,
    user_detail,
    warn_user,
)

urlpatterns = [
    ## JWT TOKEN AUTH
    path('login', login, name='token_obtain_pair'),
    path('login/refresh', TokenRefreshView.as_view(), name='token_refresh'),
    path('login/verify', TokenVerifyView.as_view(), name='token_verify'),

    ## USERS
    path('users/create', create_user, name='create_user'),
    path('users/', get_users, name='get_users'),
    path('users/email/<str:email>', get_user_by_email, name='get_user_by_email'),
    path('users/<uuid:pk>', user_detail, name='user_detail'),
    path('admin/users/<uuid:pk>/warn', warn_user, name='warn_user'),
    path('admin/users/<uuid:pk>/suspend', suspend_user, name='suspend_user'),
    path('admin/users/<uuid:pk>/ban', ban_user, name='ban_user'),
    path('machines/', machines_list, name='machines_list'),
    path('machines/<uuid:pk>', machine_detail, name='machine_detail'),

    ## POSTINGS
    path('postings/', postings_list, name='postings_list'),
    path('postings/<uuid:pk>', posting_detail, name='posting_detail'),
]