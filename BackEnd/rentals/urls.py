from django.urls import path

from .views import rental_detail, rentals_list

urlpatterns = [
    path("rentals/", rentals_list, name="rentals_list"),
    path("rentals/<uuid:pk>", rental_detail, name="rental_detail"),
]
