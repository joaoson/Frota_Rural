from django.urls import path

from document_validation.views import (
    CertificationDetailView,
    CertificationListView,
    CertificationReviewView,
    CnhValidationView,
    DocumentUploadView,
    OperatorLicenseDetailView,
    OperatorLicenseListView,
    OperatorLicenseReviewView,
)

urlpatterns = [
    path("documents/upload/", DocumentUploadView.as_view(), name="upload_document"),
    path(
        "operator-licenses/validate-document/",
        CnhValidationView.as_view(),
        name="validate_cnh_document",
    ),
    path("operator-licenses/", OperatorLicenseListView.as_view(), name="operator_licenses_list"),
    path(
        "operator-licenses/<uuid:pk>/review",
        OperatorLicenseReviewView.as_view(),
        name="review_license",
    ),
    path(
        "operator-licenses/<uuid:pk>",
        OperatorLicenseDetailView.as_view(),
        name="operator_license_detail",
    ),
    path("certifications/", CertificationListView.as_view(), name="certifications_list"),
    path(
        "certifications/<uuid:pk>/review",
        CertificationReviewView.as_view(),
        name="review_certification",
    ),
    path(
        "certifications/<uuid:pk>", CertificationDetailView.as_view(), name="certification_detail"
    ),
]
