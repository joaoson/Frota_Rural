from django.urls import path

from .views import (
    suspend_user,
    warn_user,
    ban_user,
    approve_posting,
    reject_posting,
    chat_moderation_queue,
    chat_moderation_resolve,
)

urlpatterns = [
    path('admin/users/<uuid:pk>/warn', warn_user, name='warn_user'),
    path('admin/users/<uuid:pk>/suspend', suspend_user, name='suspend_user'),
    path('admin/users/<uuid:pk>/ban', ban_user, name='ban_user'),
    path('admin/postings/<uuid:pk>/approve', approve_posting, name='approve_posting'),
    path('admin/postings/<uuid:pk>/reject', reject_posting, name='reject_posting'),
    path('admin/chat/messages/', chat_moderation_queue, name='chat_moderation_queue'),
    path('admin/chat/messages/<uuid:pk>/resolve', chat_moderation_resolve, name='chat_moderation_resolve'),
]