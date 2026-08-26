from django.urls import path
from .views import (
    reviews_list,
    review_detail,
    rentals_list,
    rental_detail,
    contracts_list,
    contract_detail,
    sign_contract,
    contract_evidence,
    request_signature_otp,
)

urlpatterns = [
    ## REVIEWS
    path('reviews/', reviews_list, name='reviews_list'),
    path('reviews/<uuid:pk>', review_detail, name='review_detail'),

    ## RENTALS & CONTRACTS
    path('rentals/', rentals_list, name='rentals_list'),
    path('rentals/<uuid:pk>', rental_detail, name='rental_detail'),
    path('contracts/', contracts_list, name='contracts_list'),
    path('contracts/<uuid:pk>', contract_detail, name='contract_detail'),
    path('contracts/<uuid:pk>/sign', sign_contract, name='sign_contract'),
    path('contracts/<uuid:pk>/evidence', contract_evidence, name='contract_evidence'),
    path('contracts/<uuid:pk>/otp', request_signature_otp, name='request_signature_otp'),
]
