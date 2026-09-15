from django.urls import path

from postings.views import PostingDetailView, PostingListView, PostingPhotoUploadView

urlpatterns = [
    path("postings/", PostingListView.as_view(), name="postings_list"),
    path("postings/<uuid:pk>", PostingDetailView.as_view(), name="posting_detail"),
    path("postings/<uuid:pk>/photos/", PostingPhotoUploadView.as_view(), name="posting_photos"),
]
