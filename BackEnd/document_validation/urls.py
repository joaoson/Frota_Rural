from django.urls import path
from .views import (
    operator_licenses_list,
    operator_license_detail,
    certifications_list,
    certification_detail,
)

urlpatterns = [
    path('operator-licenses/', operator_licenses_list, name='operator_licenses_list'),
    path('operator-licenses/<uuid:pk>', operator_license_detail, name='operator_license_detail'),
    path('certifications/', certifications_list, name='certifications_list'),
    path('certifications/<uuid:pk>', certification_detail, name='certification_detail'),
]
