from django.urls import path
from .views import (
    posting_detail,
    postings_list,
    posting_photos,
)

urlpatterns = [
    path('postings/', postings_list, name='postings_list'),
    path('postings/<uuid:pk>', posting_detail, name='posting_detail'),
    path('postings/<uuid:pk>/photos/', posting_photos, name='posting_photos'),
]