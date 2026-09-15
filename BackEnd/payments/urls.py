from django.urls import path

from payments.views import (
    PostingOccupancyView,
    RentalCheckoutView,
    RentalPaymentStatusView,
    StripeWebhookView,
)

urlpatterns = [
    path("rentals/<uuid:pk>/checkout", RentalCheckoutView.as_view(), name="criar_checkout"),
    path("rentals/<uuid:pk>/payment", RentalPaymentStatusView.as_view(), name="status_pagamento"),
    path("postings/<uuid:pk>/ocupacao", PostingOccupancyView.as_view(), name="ocupacao"),
    path("payments/webhook", StripeWebhookView.as_view(), name="stripe_webhook"),
]
