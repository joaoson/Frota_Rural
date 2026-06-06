from django.urls import path
from .views import (
    validate_cnh_document,
    operator_licenses_list,
    operator_license_detail,
    certifications_list,
    certification_detail,
    review_license,
    review_certification,
)

urlpatterns = [
    path('operator-licenses/validate-document/', validate_cnh_document, name='validate_cnh_document'),
    path('operator-licenses/', operator_licenses_list, name='operator_licenses_list'),
    path('operator-licenses/<uuid:pk>/review', review_license, name='review_license'),
    path('operator-licenses/<uuid:pk>', operator_license_detail, name='operator_license_detail'),
    path('certifications/', certifications_list, name='certifications_list'),
    path('certifications/<uuid:pk>/review', review_certification, name='review_certification'),
    path('certifications/<uuid:pk>', certification_detail, name='certification_detail'),
]
