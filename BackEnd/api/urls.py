from django.urls import path
from .views import (
    get_contracts,
)

urlpatterns = [
    path('contracts/', get_contracts, name='get_contracts'),
]
