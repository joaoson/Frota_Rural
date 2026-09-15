from django.urls import path

from contracts.views import (
    ContractDetailView,
    ContractEvidenceView,
    ContractListView,
    ContractSignatureOtpView,
    ContractSignView,
)

urlpatterns = [
    path("contracts/", ContractListView.as_view(), name="contracts_list"),
    path("contracts/<uuid:pk>", ContractDetailView.as_view(), name="contract_detail"),
    # Assinatura eletrônica
    path("contracts/<uuid:pk>/sign", ContractSignView.as_view(), name="sign_contract"),
    path("contracts/<uuid:pk>/evidence", ContractEvidenceView.as_view(), name="contract_evidence"),
    path(
        "contracts/<uuid:pk>/otp", ContractSignatureOtpView.as_view(), name="request_signature_otp"
    ),
]
