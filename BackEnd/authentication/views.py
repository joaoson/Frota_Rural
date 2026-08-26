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
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiExample, OpenApiResponse, OpenApiParameter

# Create your views here.
@extend_schema(
    summary="Realizar Login (Obter JWT)",
    description="Recebe e-mail e senha. Retorna o Token JWT (access) no corpo da resposta e o Refresh Token via Cookie HttpOnly.",
    request=LoginSerializer,
    responses={
        200: OpenApiResponse(description="Login efetuado com sucesso (Retorna o JWT Access Token)"),
        400: OpenApiResponse(description="Dados inválidos"),
        401: OpenApiResponse(description="Credenciais inválidas"),
        403: OpenApiResponse(description="Conta suspensa ou banida")
    },
    examples=[
        OpenApiExample(
            'Exemplo de Login',
            summary='Credenciais de acesso',
            value={
                "email": "contato@tratoresecia.com.br",
                "password": "senha_forte_456"
            },
            request_only=True
        )
    ]
)
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

@extend_schema(
    summary="Realizar Logout",
    description="Remove o cookie do refresh_token para invalidar a sessão atual no lado do cliente.",
    responses={204: OpenApiResponse(description="Logout efetuado com sucesso")}
)
@api_view(['POST'])
def logout(request):
    response = Response(status=status.HTTP_204_NO_CONTENT)
    response.delete_cookie('refresh_token', path='/api/login')
    return response

@extend_schema(
    summary="Renovar Token JWT",
    description="Lê o Refresh Token do Cookie HttpOnly e retorna um novo JWT Access Token válido.",
    responses={
        200: OpenApiResponse(description="Token renovado com sucesso"),
        401: OpenApiResponse(description="Refresh token inválido ou ausente")
    }
)
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
@extend_schema(
    summary="Solicitar Redefinição de Senha",
    description="Gera um token de recuperação e o envia para o e-mail do usuário (caso exista).",
    request=PasswordResetRequestSerializer,
    responses={200: OpenApiResponse(description="Se o e-mail existir, o link foi enviado.")}
)
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

@extend_schema(
    summary="Confirmar Redefinição de Senha",
    description="Recebe o token enviado por e-mail e a nova senha desejada para redefinir o acesso.",
    request=PasswordResetConfirmSerializer,
    responses={
        200: OpenApiResponse(description="Senha atualizada com sucesso"),
        400: OpenApiResponse(description="Token inválido ou expirado")
    }
)
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
