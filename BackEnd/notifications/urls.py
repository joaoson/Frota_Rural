from django.urls import path

from . import views

urlpatterns = [
    path('notifications/', views.notifications_list, name='notifications-list'),
    path('notifications/read-all', views.notifications_read_all, name='notifications-read-all'),
    path('notifications/<uuid:pk>', views.notification_detail, name='notification-detail'),
]
