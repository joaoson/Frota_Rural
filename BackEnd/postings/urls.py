from django.urls import path

from postings.views import ModalidadeEntregaListView, PostingDetailView, PostingListView, PostingPhotoUploadView
from postings.views.recommendations import PostingRecommendationView

urlpatterns = [
    path("postings", PostingListView.as_view(), name="postings_list"),
    path("postings/recommendations", PostingRecommendationView.as_view(), name="posting_recommendations"),
    path("postings/<uuid:pk>", PostingDetailView.as_view(), name="posting_detail"),
    path("postings/<uuid:pk>/photos", PostingPhotoUploadView.as_view(), name="posting_photos"),
    path("postings/modalidades-entrega", ModalidadeEntregaListView.as_view(), name="posting_modalidades_entrega"),
]
