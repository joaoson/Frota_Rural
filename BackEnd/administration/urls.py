from django.urls import path

from administration.views import (
    ChatModerationQueueView,
    ChatModerationResolveView,
    PostingApproveView,
    PostingRejectView,
    UserBanView,
    UserSuspendView,
    UserWarnView,
)

urlpatterns = [
    path("admin/users/<uuid:pk>/warn", UserWarnView.as_view(), name="warn_user"),
    path("admin/users/<uuid:pk>/suspend", UserSuspendView.as_view(), name="suspend_user"),
    path("admin/users/<uuid:pk>/ban", UserBanView.as_view(), name="ban_user"),
    path("admin/postings/<uuid:pk>/approve", PostingApproveView.as_view(), name="approve_posting"),
    path("admin/postings/<uuid:pk>/reject", PostingRejectView.as_view(), name="reject_posting"),
    path("admin/chat/messages/", ChatModerationQueueView.as_view(), name="chat_moderation_queue"),
    path(
        "admin/chat/messages/<uuid:pk>/resolve",
        ChatModerationResolveView.as_view(),
        name="chat_moderation_resolve",
    ),
]
