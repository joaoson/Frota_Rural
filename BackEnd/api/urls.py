from django.urls import path
from .views import (
    reviews_list,
    review_detail,
    rentals_list,
    rental_detail,
)

urlpatterns = [
    ## REVIEWS
    path('reviews/', reviews_list, name='reviews_list'),
    path('reviews/<uuid:pk>', review_detail, name='review_detail'),

    ## RENTALS
    path('rentals/', rentals_list, name='rentals_list'),
    path('rentals/<uuid:pk>', rental_detail, name='rental_detail'),
]
