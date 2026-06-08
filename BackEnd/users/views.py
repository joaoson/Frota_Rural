from django.db import IntegrityError
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from users.models import Users
from users.serializer import UserSerializer, ChangePasswordSerializer

# Create your views here.
# TODO: ROLE FIELD SHOULD MATCH ONE THE ENUMS
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

@api_view(['GET'])
def get_users(request):
    users = Users.objects.all()
    serializer = UserSerializer(users, many=True)
    return Response(serializer.data)

@api_view(['GET'])
def get_user_by_email(request, email):
    try:
        user = Users.objects.get(email=email)
        serializer = UserSerializer(user)
        return Response(serializer.data, status=status.HTTP_200_OK)
    except Users.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

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
