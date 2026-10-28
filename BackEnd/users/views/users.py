from uuid import UUID

from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from administration.permissions import IsPlatformAdmin

from common.request import authenticated_user
from common.schemas import error_response, error_responses
from users.serializer import (
    ChangePasswordInputSerializer,
    PortePropriedadeOutputSerializer,
    UserCreateInputSerializer,
    UserOutputSerializer,
    UserUpdateInputSerializer,
)
from users.services import PortePropriedadeService, UserService

TAGS = ["Usuários"]
USER_NOT_FOUND = error_response(404, "Usuário não encontrado.")


class UserCreateView(APIView):
    @extend_schema(
        tags=TAGS,
        summary="Criar um novo usuário",
        description=(
            "Cadastro público de conta como locador, locatário ou operador. E-mail e documento "
            "repetidos voltam como erro de validação no campo."
        ),
        request=UserCreateInputSerializer,
        responses={
            201: UserOutputSerializer,
            **error_responses(400, 409),
            403: error_response(403, "Cadastro bloqueado: documento vinculado a conta banida."),
        },
        examples=[
            OpenApiExample(
                "Perfil: Locatário (Produtor Rural)",
                summary="Produtor que alugará máquinas",
                value={
                    "name": "José Almeida",
                    "document": "12345678909",
                    "email": "jose.almeida@fazenda.com.br",
                    "password": "senha_segura_123",
                    "phone": "+5541999999999",
                    "role": "locatario",
                    "address": "Estrada da Colônia, km 4",
                    "city": "Castro",
                    "state": "PR",
                    "cep": "84165000",
                    "birth_date": "1985-03-15",
                },
                request_only=True,
            ),
        ],
    )
    def post(self, request: Request) -> Response:
        user = UserService.create(request.data)
        return Response(UserOutputSerializer(user).data, status=status.HTTP_201_CREATED)


class UserListView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(
        tags=TAGS,
        summary="Listar usuários",
        description="Retorna a lista completa de usuários cadastrados, em ordem alfabética.",
        responses={200: UserOutputSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        users = UserService.list()
        return Response(UserOutputSerializer(users, many=True).data, status=status.HTTP_200_OK)


class UserByEmailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Buscar usuário por e-mail",
        description="Consulta um perfil por endereço de e-mail respeitando as permissões e os campos públicos do serviço.",
        responses={200: UserOutputSerializer, 404: USER_NOT_FOUND},
    )
    def get(self, request: Request, email: str) -> Response:
        user = UserService.get_by_email(email, actor=authenticated_user(request))
        return Response(UserOutputSerializer(user).data, status=status.HTTP_200_OK)


class UserDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Consultar usuário",
        description="Retorna os campos de perfil permitidos para o usuário autenticado.",
        responses={200: UserOutputSerializer, 404: USER_NOT_FOUND},
    )
    def get(self, request: Request, pk: UUID) -> Response:
        user = UserService.get(pk, actor=authenticated_user(request))
        return Response(UserOutputSerializer(user).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Substituir dados do perfil",
        description="Valida e substitui os campos editáveis do próprio perfil, sujeito às permissões administrativas.",
        request=UserUpdateInputSerializer,
        responses={200: UserOutputSerializer, **error_responses(400, 409), 404: USER_NOT_FOUND},
    )
    def put(self, request: Request, pk: UUID) -> Response:
        user = UserService.update(pk, request.data, actor=authenticated_user(request))
        return Response(UserOutputSerializer(user).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Atualizar perfil parcialmente",
        description="Atualiza apenas os campos enviados, como telefone ou endereço.",
        request=UserUpdateInputSerializer,
        responses={200: UserOutputSerializer, **error_responses(400, 409), 404: USER_NOT_FOUND},
    )
    def patch(self, request: Request, pk: UUID) -> Response:
        user = UserService.update(pk, request.data, actor=authenticated_user(request), partial=True)
        return Response(UserOutputSerializer(user).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Excluir usuário",
        description="Remove o usuário quando permitido pelas regras de autorização e integridade dos vínculos existentes.",
        responses={
            204: None,
            404: USER_NOT_FOUND,
            409: error_response(409, "Existem registros vinculados à conta."),
        },
    )
    def delete(self, request: Request, pk: UUID) -> Response:
        UserService.delete(pk, actor=authenticated_user(request))
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Alterar senha do usuário",
        description="Atualiza a senha, conferindo antes a senha atual.",
        request=ChangePasswordInputSerializer,
        responses={
            204: None,
            400: error_response(400, "Senha atual incorreta ou nova senha inválida."),
            404: USER_NOT_FOUND,
        },
        examples=[
            OpenApiExample(
                "Troca de Senha Padrão",
                value={
                    "current_password": "senha_antiga_123",
                    "new_password": "nova_senha_segura_456",
                },
                request_only=True,
            )
        ],
    )
    def post(self, request: Request, pk: UUID) -> Response:
        UserService.change_password(pk, request.data, actor=authenticated_user(request))
        return Response(status=status.HTTP_204_NO_CONTENT)


class PortePropriedadeListView(APIView):
    # Público: o cadastro (Signup) ainda não tem login.
    permission_classes = [AllowAny]

    @extend_schema(
        tags=TAGS,
        summary="Listar portes de propriedade",
        description="Opções da tabela `portes_propriedade` usadas no cadastro e em Minha Conta.",
        responses={200: PortePropriedadeOutputSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        portes = PortePropriedadeService.list()
        return Response(PortePropriedadeOutputSerializer(portes, many=True).data, status=status.HTTP_200_OK)
