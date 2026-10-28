from django.urls import path

from reviews.views import CriterioAvaliacaoListView, ReviewDetailView, ReviewListView

urlpatterns = [
    path("reviews/", ReviewListView.as_view()),
    path("reviews", ReviewListView.as_view(), name="reviews_list"),
    path("reviews/criterios", CriterioAvaliacaoListView.as_view(), name="review_criterios"),
    path("reviews/<uuid:pk>", ReviewDetailView.as_view(), name="review_detail"),
]
