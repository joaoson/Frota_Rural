from django.urls import path
from .recurrence_views import recurrence_create, recurrence_preview
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
    path('rentals/<uuid:pk>/recurrence/preview', recurrence_preview, name='rental_recurrence_preview'),
    path('rentals/<uuid:pk>/recurrence', recurrence_create, name='rental_recurrence_create'),
]
