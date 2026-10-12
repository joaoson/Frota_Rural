from django.urls import path

from machines.views import MachineDetailView, MachineListView

urlpatterns = [
    path("machines", MachineListView.as_view(), name="machines_list"),
    path("machines/<uuid:pk>", MachineDetailView.as_view(), name="machine_detail"),
]
