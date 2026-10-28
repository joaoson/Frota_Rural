from document_validation.views.certifications import (
    CertificationDetailView,
    CertificationListView,
    CertificationReviewView,
)
from document_validation.views.files import CnhValidationView, DocumentUploadView
from document_validation.views.licenses import (
    OperatorLicenseDetailView,
    OperatorLicenseListView,
    OperatorLicenseReviewView,
)

__all__ = [
    "CertificationDetailView",
    "CertificationListView",
    "CertificationReviewView",
    "CnhValidationView",
    "DocumentUploadView",
    "OperatorLicenseDetailView",
    "OperatorLicenseListView",
    "OperatorLicenseReviewView",
]
