from django.urls import path

from .views import criar_checkout, ocupacao, status_pagamento, webhook

urlpatterns = [
    path('rentals/<uuid:pk>/checkout', criar_checkout, name='criar_checkout'),
    path('rentals/<uuid:pk>/payment', status_pagamento, name='status_pagamento'),
    path('postings/<uuid:pk>/ocupacao', ocupacao, name='ocupacao'),
    path('payments/webhook', webhook, name='stripe_webhook'),
]
