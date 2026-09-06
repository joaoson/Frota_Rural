from django.urls import path
from .views import (
    contracts_list,
    contract_detail,
    sign_contract,
    contract_evidence,
    request_signature_otp,
)

urlpatterns = [
    ## CONTRACTS
    path('contracts/', contracts_list, name='contracts_list'),
    path('contracts/<uuid:pk>', contract_detail, name='contract_detail'),

    ## ASSINATURA ELETRÔNICA
    path('contracts/<uuid:pk>/sign', sign_contract, name='sign_contract'),
    path('contracts/<uuid:pk>/evidence', contract_evidence, name='contract_evidence'),
    path('contracts/<uuid:pk>/otp', request_signature_otp, name='request_signature_otp'),
]
