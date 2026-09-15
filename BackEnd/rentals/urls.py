from django.urls import path

from rentals.views import RentalDetailView, RentalListView

urlpatterns = [
    path("rentals/", RentalListView.as_view(), name="rentals_list"),
    path("rentals/<uuid:pk>", RentalDetailView.as_view(), name="rental_detail"),
]
