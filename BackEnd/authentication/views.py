import hashlib
import secrets
from datetime import timedelta
from django.utils import timezone
from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.response import Response
from authentication.emailing.email import send_password_reset_email
from authentication.models import PasswordResets
from authentication.serializer import LoginSerializer, PasswordResetRequestSerializer, PasswordResetConfirmSerializer
from users.models import Users

# Create your views here.
@api_view(['POST'])
def login(request):
    serializer = LoginSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    email = serializer.validated_data['email']
    request_password = serializer.validated_data['password']

    try:
        user = Users.objects.get(email=email)
    except Users.DoesNotExist:
        return Response({'detail': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

    if not user.check_password(request_password):
        return Response({'detail': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

    if user.status in ('suspended', 'banned'):
        return Response({'detail': 'Account is disabled.'}, status=status.HTTP_403_FORBIDDEN)

    refresh = RefreshToken.for_user(user)
    refresh['email'] = user.email
    refresh['role'] = user.role

    response = Response({'access': str(refresh.access_token)}, status=status.HTTP_200_OK)
    response.set_cookie(
        key='refresh_token',
        value=str(refresh),
        max_age=7 * 24 * 60 * 60,
        httponly=True,
        samesite='Lax',
        secure=not settings.DEBUG,
        path='/api/login',
    )
    return response

@api_view(['POST'])
def logout(request):
    response = Response(status=status.HTTP_204_NO_CONTENT)
    response.delete_cookie('refresh_token', path='/api/login')
    return response

@api_view(['POST'])
def refresh_token(request):
    raw = request.COOKIES.get('refresh_token')
    if not raw:
        return Response({'detail': 'No refresh token.'}, status=status.HTTP_401_UNAUTHORIZED)
    try:
        refresh = RefreshToken(raw)
        return Response({'access': str(refresh.access_token)}, status=status.HTTP_200_OK)
    except Exception:
        return Response({'detail': 'Invalid or expired refresh token.'}, status=status.HTTP_401_UNAUTHORIZED)


## - PASSWORD RESET
@api_view(['POST'])
def request_password_reset(request):
    serializer = PasswordResetRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    email = serializer.validated_data['email']
    safe_response = {'message': 'If an account with that email exists, a reset link has been sent.'}

    try:
        user = Users.objects.get(email=email)
    except Users.DoesNotExist:
        return Response(safe_response, status=status.HTTP_200_OK)

    PasswordResets.objects.filter(user=user, used=False).update(used=True)

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    PasswordResets.objects.create(
        user=user,
        token_hash=token_hash,
        expires_at=timezone.now() + timedelta(seconds=settings.PASSWORD_RESET_TIMEOUT),
    )

    send_password_reset_email(user.email, raw_token)

    if settings.DEBUG:
        print(f'\n[PASSWORD RESET] Raw token: {raw_token}\n', flush=True)

    return Response(safe_response, status=status.HTTP_200_OK)

@api_view(['POST'])
def confirm_password_reset(request):
    serializer = PasswordResetConfirmSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    raw_token = serializer.validated_data['token']
    new_password = serializer.validated_data['new_password']

    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    try:
        reset = PasswordResets.objects.get(
            token_hash=token_hash,
            used=False,
            expires_at__gt=timezone.now(),
        )
    except PasswordResets.DoesNotExist:
        return Response({'detail': 'Invalid or expired token.'}, status=status.HTTP_400_BAD_REQUEST)

    user = reset.user
    user.set_password(new_password)
    user.save()

    reset.used = True
    reset.save()

    return Response({'detail': 'Password updated successfully.'}, status=status.HTTP_200_OK)
