from collections.abc import Sequence

from django.conf import settings
from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import status
from rest_framework.authentication import BaseAuthentication
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.settings import api_settings as jwt_settings
from rest_framework_simplejwt.views import TokenVerifyView

from authentication.serializer import AccessTokenOutputSerializer, LoginInputSerializer
from authentication.services import AuthService
from common.schemas import error_response, error_responses

TAGS = ["Autenticação"]

# O refresh token vive só neste cookie HttpOnly, restrito às rotas de login:
# o JavaScript do front nunca tem acesso a ele.
REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_PATH = "/api/login"


class PublicAuthView(APIView):
    """Base dos endpoints que funcionam sem sessão.

    Sem autenticadores: um access token vencido no header não pode impedir o
    login ou a renovação que existem justamente para resolver isso.
    """

    authentication_classes: Sequence[type[BaseAuthentication]] = ()
    permission_classes: Sequence[type[BasePermission]] = (AllowAny,)


class LoginView(PublicAuthView):
    @extend_schema(
        tags=TAGS,
        summary="Realizar login (obter JWT)",
        description=(
            "Recebe e-mail e senha. Devolve o access token no corpo e grava o refresh token em um "
            "cookie HttpOnly restrito ao caminho `/api/login`, renovável em `POST /api/login/refresh`."
        ),
        request=LoginInputSerializer,
        responses={
            200: AccessTokenOutputSerializer,
            **error_responses(400),
            401: error_response(401, "E-mail ou senha inválidos."),
            403: error_response(403, "Conta suspensa ou banida."),
        },
        examples=[
            OpenApiExample(
                "Exemplo de Login",
                summary="Credenciais de acesso",
                value={"email": "contato@tratoresecia.com.br", "password": "senha_forte_456"},
                request_only=True,
            )
        ],
    )
    def post(self, request: Request) -> Response:
        tokens = AuthService.login(request.data)
        response = Response(
            AccessTokenOutputSerializer({"access": tokens.access}).data,
            status=status.HTTP_200_OK,
        )
        response.set_cookie(
            key=REFRESH_COOKIE_NAME,
            value=tokens.refresh,
            max_age=int(jwt_settings.REFRESH_TOKEN_LIFETIME.total_seconds()),
            httponly=True,
            samesite="Lax",
            secure=not settings.DEBUG,
            path=REFRESH_COOKIE_PATH,
        )
        return response


class RefreshTokenView(PublicAuthView):
    @extend_schema(
        tags=TAGS,
        summary="Renovar token JWT",
        description=(
            "Lê o refresh token do cookie HttpOnly gravado no login e devolve um novo access token. "
            "Não recebe corpo: o cookie precisa ser enviado junto da requisição."
        ),
        request=None,
        responses={
            200: AccessTokenOutputSerializer,
            401: error_response(401, "Refresh token ausente, inválido ou expirado."),
        },
    )
    def post(self, request: Request) -> Response:
        access = AuthService.refresh(request.COOKIES.get(REFRESH_COOKIE_NAME))
        return Response(
            AccessTokenOutputSerializer({"access": access}).data, status=status.HTTP_200_OK
        )


class LogoutView(PublicAuthView):
    @extend_schema(
        tags=TAGS,
        summary="Realizar logout",
        description="Remove o cookie `refresh_token`, encerrando a sessão no cliente. Não exige corpo na requisição.",
        request=None,
        responses={204: None},
    )
    def post(self, request: Request) -> Response:
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)
        return response


@extend_schema(
    tags=TAGS,
    summary="Verificar token JWT",
    description=(
        "Confirma se um access token continua válido e não expirou. "
        "Responde 200 com corpo vazio quando o token é válido."
    ),
    responses={
        200: None,
        401: error_response(401, "Token inválido ou expirado."),
    },
)
class VerifyTokenView(TokenVerifyView):
    """Endpoint do SimpleJWT, envolvido para entrar na documentação."""

    def get_authenticate_header(self, request: Request) -> str:
        # Sem autenticadores o DRF converteria o 401 de token inválido em 403.
        return 'Bearer realm="api"'
