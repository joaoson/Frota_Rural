from django.urls import path

from chat.views import (
    MessageReportView,
    ThreadDetailView,
    ThreadListView,
    ThreadMessagesView,
    ThreadReadView,
    ThreadResolveView,
    UnreadCountView,
)

urlpatterns = [
    path("chat/threads/resolve", ThreadResolveView.as_view(), name="chat_resolve_thread"),
    path("chat/threads/", ThreadListView.as_view(), name="chat_list_threads"),
    path("chat/unread", UnreadCountView.as_view(), name="chat_unread"),
    # thread_id vai como um único segmento url-encoded pelo cliente; <str:> casa
    # com tudo menos '/', e os dois-pontos da chave são pchar válido.
    # Depois de 'resolve' e 'threads/': <str:> casaria com eles também.
    path("chat/threads/<str:thread_id>", ThreadDetailView.as_view(), name="chat_get_thread"),
    path(
        "chat/threads/<str:thread_id>/messages",
        ThreadMessagesView.as_view(),
        name="chat_messages",
    ),
    path("chat/threads/<str:thread_id>/read", ThreadReadView.as_view(), name="chat_mark_read"),
    path("chat/messages/<uuid:pk>/report", MessageReportView.as_view(), name="chat_report_message"),
]
