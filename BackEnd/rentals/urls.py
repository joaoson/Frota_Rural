from django.urls import path

from api.recurrence_views import recurrence_create, recurrence_preview
from rentals.views import (
    BookingPolicyView,
    MachineUsageView,
    RentalCompleteView,
    RentalDetailView,
    RentalListView,
    RentalMeterReadingsView,
)

urlpatterns = [
    path("rentals/", RentalListView.as_view()),
    path("rentals/policy", BookingPolicyView.as_view(), name="rental_booking_policy"),
    path("rentals/<uuid:pk>/recurrence/preview", recurrence_preview, name="rental_recurrence_preview"),
    path("rentals/<uuid:pk>/recurrence", recurrence_create, name="rental_recurrence_create"),
    path("rentals", RentalListView.as_view(), name="rentals_list"),
    path("rentals/<uuid:pk>", RentalDetailView.as_view(), name="rental_detail"),
    path("rentals/<uuid:pk>/meter-readings", RentalMeterReadingsView.as_view(), name="rental_meter_readings"),
    path("rentals/<uuid:pk>/complete", RentalCompleteView.as_view(), name="rental_complete"),
    path("machines/<uuid:pk>/usage", MachineUsageView.as_view(), name="machine_usage"),
]
