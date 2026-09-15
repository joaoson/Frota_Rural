from django.urls import path

from .views import review_detail, reviews_list

urlpatterns = [
    path("reviews/", reviews_list, name="reviews_list"),
    path("reviews/<uuid:pk>", review_detail, name="review_detail"),
]
