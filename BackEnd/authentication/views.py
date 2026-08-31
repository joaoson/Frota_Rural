import hashlib
import secrets
from datetime import timedelta
from django.utils import timezone
from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenVerifyView
from rest_framework.response import Response
from authentication.emailing.email import send_password_reset_email
from authentication.models import PasswordResets
from authentication.serializer import (
    AccessTokenSerializer,
    DetailResponseSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetMessageSerializer,
    PasswordResetRequestSerializer,
)
from users.models import Users
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiExample, OpenApiResponse, OpenApiParameter

@extend_schema(
    tags=['Autenticação'],
    summary='Verificar token JWT',
    description=(
        'Confirma se um access token continua válido e não expirou. '
        'Responde 200 com corpo vazio quando o token é válido.'
    ),
    responses={
        200: OpenApiResponse(description='Token válido.'),
        401: OpenApiResponse(response=DetailResponseSerializer, description='Token inválido ou expirado.'),
    },
)
class VerifyTokenView(TokenVerifyView):
    """Endpoint do SimpleJWT, envolvido apenas para entrar na documentação."""


@extend_schema(
    tags=['Autenticação'],
    summary="Realizar login (obter JWT)",
    description=(
        "Recebe e-mail e senha. Devolve o access token no corpo e grava o refresh token em um "
        "cookie HttpOnly restrito ao caminho `/api/login`, renovável em `POST /api/login/refresh`."
    ),
    request=LoginSerializer,
    responses={
        200: AccessTokenSerializer,
        400: OpenApiResponse(description="Dados inválidos."),
        401: OpenApiResponse(response=DetailResponseSerializer, description="Credenciais inválidas."),
        403: OpenApiResponse(response=DetailResponseSerializer, description="Conta suspensa ou banida."),
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
    tags=['Autenticação'],
    summary="Realizar logout",
    description="Remove o cookie `refresh_token`, encerrando a sessão no cliente. Não exige corpo na requisição.",
    request=None,
    responses={204: OpenApiResponse(description="Logout efetuado com sucesso.")}
)
@api_view(['POST'])
def logout(request):
    response = Response(status=status.HTTP_204_NO_CONTENT)
    response.delete_cookie('refresh_token', path='/api/login')
    return response

@extend_schema(
    tags=['Autenticação'],
    summary="Renovar token JWT",
    description=(
        "Lê o refresh token do cookie HttpOnly gravado no login e devolve um novo access token. "
        "Não recebe corpo: o cookie precisa ser enviado junto da requisição."
    ),
    request=None,
    responses={
        200: AccessTokenSerializer,
        401: OpenApiResponse(response=DetailResponseSerializer, description="Refresh token inválido ou ausente."),
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
    tags=['Autenticação'],
    summary="Solicitar redefinição de senha",
    description=(
        "Gera um token de recuperação e o envia por e-mail. A resposta é sempre a mesma, exista "
        "ou não uma conta com aquele e-mail, para não revelar quem está cadastrado."
    ),
    request=PasswordResetRequestSerializer,
    responses={
        200: PasswordResetMessageSerializer,
        400: OpenApiResponse(description="E-mail em formato inválido."),
    }
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
    tags=['Autenticação'],
    summary="Confirmar redefinição de senha",
    description=(
        "Troca a senha usando o token recebido por e-mail. O token é de uso único e expira; "
        "pedidos anteriores em aberto são invalidados a cada nova solicitação."
    ),
    request=PasswordResetConfirmSerializer,
    responses={
        200: OpenApiResponse(response=DetailResponseSerializer, description="Senha atualizada com sucesso."),
        400: OpenApiResponse(response=DetailResponseSerializer, description="Token inválido, expirado ou já utilizado."),
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
