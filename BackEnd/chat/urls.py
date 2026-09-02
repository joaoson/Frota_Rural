from django.urls import path

from .views import (
    get_thread,
    messages_collection,
    list_threads,
    mark_read,
    report_message,
    resolve_thread,
    unread,
)

urlpatterns = [
    path('chat/threads/resolve', resolve_thread, name='chat_resolve_thread'),
    path('chat/threads/', list_threads, name='chat_list_threads'),
    path('chat/unread', unread, name='chat_unread'),
    # thread_id vai como um único segmento url-encoded pelo cliente; <str:> casa
    # com tudo menos '/', e os dois-pontos da chave são pchar válido.
    # Depois de 'resolve' e 'threads/': <str:> casaria com eles também.
    path('chat/threads/<str:thread_id>', get_thread, name='chat_get_thread'),
    path('chat/threads/<str:thread_id>/messages', messages_collection, name='chat_messages'),
    path('chat/threads/<str:thread_id>/read', mark_read, name='chat_mark_read'),
    path('chat/messages/<uuid:pk>/report', report_message, name='chat_report_message'),
]
