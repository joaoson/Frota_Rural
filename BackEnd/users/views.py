from django.db import IntegrityError
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from users.models import Users
from users.serializer import UserSerializer, ChangePasswordSerializer
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiExample, OpenApiResponse

# Create your views here.
# TODO: ROLE FIELD SHOULD MATCH ONE THE ENUMS
USER_NOT_FOUND = OpenApiResponse(description="Usuário não encontrado.")
USER_CONFLICT = OpenApiResponse(description="E-mail ou documento já cadastrado em outra conta.")


@extend_schema(
    tags=['Usuários'],
    summary="Criar um novo usuário",
    description="Endpoint para cadastro de novos usuários na plataforma. O usuário pode ter diferentes papéis (locador, locatario, operador).",
    request=UserSerializer,
    responses={
        201: OpenApiResponse(description="Usuário criado com sucesso", response=UserSerializer),
        400: OpenApiResponse(description="Dados de entrada inválidos"),
        403: OpenApiResponse(description="Cadastro bloqueado (usuário banido)"),
        409: OpenApiResponse(description="Conflito (E-mail ou Documento já em uso)"),
    },
    examples=[
        OpenApiExample(
            'Perfil: Locatário (Produtor Rural)',
            summary='Exemplo de cadastro de um produtor que alugará máquinas',
            description='Um agricultor se cadastrando com CPF para locar colheitadeiras.',
            value={
                "name": "José Almeida",
                "document": "12345678909",
                "email": "jose.almeida@fazenda.com.br",
                "password_hash": "senha_segura_123",
                "phone": "+5541999999999",
                "role": "locatario",
                "status": "active"
            },
            request_only=True
        ),
        OpenApiExample(
            'Perfil: Locador (Empresa de Frota)',
            summary='Exemplo de cadastro de um dono de frota agrícola',
            description='Uma empresa de maquinário se cadastrando com CNPJ.',
            value={
                "name": "Tratores & Cia LTDA",
                "document": "12345678000199",
                "email": "contato@tratoresecia.com.br",
                "password_hash": "senha_forte_456",
                "phone": "+5511988888888",
                "role": "locador",
                "status": "active"
            },
            request_only=True
        )
    ]
)
@api_view(['POST'])
def create_user(request):
    document = request.data.get('document')
    if document and Users.objects.filter(document=document, status='banned').exists():
        return Response({'error': 'Cadastro bloqueado: documento vinculado a conta banida.'}, status=status.HTTP_403_FORBIDDEN)

    serializer = UserSerializer(data=request.data)
    if serializer.is_valid():
        try:
            serializer.save()
        except IntegrityError as e:
            error_msg = str(e).lower()
            if 'email' in error_msg:
                return Response({'email': ['Este e-mail já está em uso.']}, status=status.HTTP_409_CONFLICT)
            if 'document' in error_msg:
                return Response({'document': ['Este documento já está cadastrado.']}, status=status.HTTP_409_CONFLICT)
            return Response({'error': 'Dados em conflito.'}, status=status.HTTP_409_CONFLICT)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@extend_schema(
    tags=['Usuários'],
    summary="Listar usuários",
    description="Retorna a lista completa de usuários cadastrados no sistema.",
    responses={200: UserSerializer(many=True)}
)
@api_view(['GET'])
def get_users(request):
    users = Users.objects.all()
    serializer = UserSerializer(users, many=True)
    return Response(serializer.data)

@extend_schema(
    tags=['Usuários'],
    summary="Buscar usuário por e-mail",
    description="Retorna os detalhes de um usuário específico utilizando o e-mail como chave de busca.",
    responses={
        200: UserSerializer,
        404: OpenApiResponse(description="Usuário não encontrado")
    }
)
@api_view(['GET'])
def get_user_by_email(request, email):
    try:
        user = Users.objects.get(email=email)
        serializer = UserSerializer(user)
        return Response(serializer.data, status=status.HTTP_200_OK)
    except Users.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

@extend_schema_view(
    get=extend_schema(
        tags=['Usuários'],
        summary="Consultar usuário",
        responses={200: UserSerializer, 404: USER_NOT_FOUND},
    ),
    put=extend_schema(
        tags=['Usuários'],
        summary="Substituir usuário",
        request=UserSerializer,
        responses={
            200: UserSerializer,
            400: OpenApiResponse(description="Dados de entrada inválidos."),
            404: USER_NOT_FOUND,
            409: USER_CONFLICT,
        },
    ),
    patch=extend_schema(
        tags=['Usuários'],
        summary="Atualizar usuário parcialmente",
        description="Atualiza apenas os campos enviados, como telefone ou endereço.",
        request=UserSerializer,
        responses={
            200: UserSerializer,
            400: OpenApiResponse(description="Dados de entrada inválidos."),
            404: USER_NOT_FOUND,
            409: USER_CONFLICT,
        },
    ),
    delete=extend_schema(
        tags=['Usuários'],
        summary="Excluir usuário",
        responses={204: OpenApiResponse(description="Usuário excluído."), 404: USER_NOT_FOUND},
    ),
)
@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
def user_detail(request, pk):
    try:
        user = Users.objects.get(pk=pk)
    except Users.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        serializer = UserSerializer(user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    elif request.method == 'PUT':
        serializer = UserSerializer(user, data=request.data)
        if serializer.is_valid():
            try:
                serializer.save()
            except IntegrityError as e:
                error_msg = str(e).lower()
                if 'email' in error_msg:
                    return Response({'email': ['Este e-mail já está em uso.']}, status=status.HTTP_409_CONFLICT)
                if 'document' in error_msg:
                    return Response({'document': ['Este documento já está cadastrado.']}, status=status.HTTP_409_CONFLICT)
                return Response({'error': 'Dados em conflito.'}, status=status.HTTP_409_CONFLICT)
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    elif request.method == 'PATCH':
        serializer = UserSerializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            try:
                serializer.save()
            except IntegrityError as e:
                error_msg = str(e).lower()
                if 'email' in error_msg:
                    return Response({'email': ['Este e-mail já está em uso.']}, status=status.HTTP_409_CONFLICT)
                if 'document' in error_msg:
                    return Response({'document': ['Este documento já está cadastrado.']}, status=status.HTTP_409_CONFLICT)
                return Response({'error': 'Dados em conflito.'}, status=status.HTTP_409_CONFLICT)
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    elif request.method == 'DELETE':
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    return Response(status=status.HTTP_400_BAD_REQUEST)

@extend_schema(
    tags=['Usuários'],
    summary="Alterar senha do usuário",
    description="Permite que o usuário autenticado atualize sua própria senha, fornecendo a senha atual e a nova.",
    request=ChangePasswordSerializer,
    responses={
        204: OpenApiResponse(description="Senha alterada com sucesso"),
        400: OpenApiResponse(description="Senha atual incorreta ou dados inválidos"),
        404: OpenApiResponse(description="Usuário não encontrado")
    },
    examples=[
        OpenApiExample(
            'Troca de Senha Padrão',
            summary='Exemplo de payload para troca de senha',
            value={
                "current_password": "senha_antiga_123",
                "new_password": "nova_senha_segura_456"
            },
            request_only=True
        )
    ]
)
@api_view(['POST'])
def change_password(request, pk):
    try:
        user = Users.objects.get(pk=pk)
    except Users.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    serializer = ChangePasswordSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    if not user.check_password(serializer.validated_data['current_password']):
        return Response(
            {'error': 'Senha atual incorreta.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.set_password(serializer.validated_data['new_password'])
    user.save()
    return Response(status=status.HTTP_204_NO_CONTENT)
