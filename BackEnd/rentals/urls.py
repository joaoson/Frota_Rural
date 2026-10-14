from django.urls import path

from api.recurrence_views import recurrence_create, recurrence_preview
from rentals.views import RentalDetailView, RentalListView

urlpatterns = [
    path("rentals/", RentalListView.as_view()),
    path("rentals/<uuid:pk>/recurrence/preview", recurrence_preview, name="rental_recurrence_preview"),
    path("rentals/<uuid:pk>/recurrence", recurrence_create, name="rental_recurrence_create"),
    path("rentals", RentalListView.as_view(), name="rentals_list"),
    path("rentals/<uuid:pk>", RentalDetailView.as_view(), name="rental_detail"),
]
