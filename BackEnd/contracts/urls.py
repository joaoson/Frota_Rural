from django.urls import path

from contracts.views import (
    ContractDetailView,
    ContractEvidenceView,
    ContractListView,
    ContractSignatureOtpView,
    ContractSignView,
)

from contracts.views.amendments import ContractAmendmentsView, ContractAmendmentDecisionView

urlpatterns = [
    path("contracts/<uuid:pk>/amendments", ContractAmendmentsView.as_view(), name="contract_amendments"),
    path("contracts", ContractListView.as_view(), name="contracts_list"),
    path("contracts/<uuid:pk>", ContractDetailView.as_view(), name="contract_detail"),
    # Assinatura eletrônica
    path("contracts/<uuid:pk>/sign", ContractSignView.as_view(), name="sign_contract"),
    path("contracts/<uuid:pk>/evidence", ContractEvidenceView.as_view(), name="contract_evidence"),
    path(
        "contracts/<uuid:pk>/otp", ContractSignatureOtpView.as_view(), name="request_signature_otp"
    ),
]

for action in ("accept", "reject", "withdraw"):
    urlpatterns.append(path(
        f"contracts/<uuid:pk>/amendments/<uuid:amendment_id>/{action}",
        ContractAmendmentDecisionView.as_view(), {"action": action}, name=f"amendment_{action}",
    ))
