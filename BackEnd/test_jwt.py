import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'frota_rural.settings')
django.setup()

from api.models import Users
from rest_framework_simplejwt.tokens import RefreshToken

user = Users.objects.first()
if user:
    refresh = RefreshToken.for_user(user)
    refresh['email'] = user.email
    refresh['role'] = user.role
    
    access = refresh.access_token
    print("Refresh claims:", refresh.payload.get('role'))
    print("Access claims:", access.payload.get('role'))
