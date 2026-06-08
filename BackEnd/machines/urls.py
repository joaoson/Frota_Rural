from django.urls import path

from .views import (
    machine_detail,
    machines_list,
)

urlpatterns = [
    path('machines/', machines_list, name='machines_list'),
    path('machines/<uuid:pk>', machine_detail, name='machine_detail'),
]