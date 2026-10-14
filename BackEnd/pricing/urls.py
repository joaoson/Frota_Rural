from django.urls import path

from .views import pricing_suggest

urlpatterns = [
    path('pricing/suggest', pricing_suggest, name='pricing_suggest'),
]
