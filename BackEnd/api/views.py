from django.core.serializers import serialize
from django.shortcuts import render
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from .models import Users, Machines, Postings, Rentals, Contracts
from .serializer import UserSerializer

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

@api_view(['GET', 'PUT', 'DELETE'])
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
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    elif request.method == 'DELETE':
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    return Response(status=status.HTTP_400_BAD_REQUEST)

# TODO: ROLE FIELD SHOULD MATCH ONE THE ENUMS
# TODO: HASH PASSWORD BEFORE STORING USER
@api_view(['POST'])
def create_user(request):
    document = request.data.get('document')
    if document and Users.objects.filter(document=document, status='banned').exists():
        return Response({'error': 'Cadastro bloqueado: documento vinculado a conta banida.'}, status=status.HTTP_403_FORBIDDEN)

    serializer = UserSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT'])
def warn_user(request, pk):
    try:
        user = Users.objects.get(pk=pk)
    except Users.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if user.status in ('suspended', 'banned'):
        return Response({'error': f'Usuário já está {user.status}.'}, status=status.HTTP_400_BAD_REQUEST)

    user.status = 'warned'
    user.save()
    return Response({'message': f'Advertência aplicada ao usuário {user.name}.'}, status=status.HTTP_200_OK)


@api_view(['PUT'])
def suspend_user(request, pk):
    try:
        user = Users.objects.get(pk=pk)
    except Users.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if user.status == 'banned':
        return Response({'error': 'Usuário já está banido.'}, status=status.HTTP_400_BAD_REQUEST)

    user.status = 'suspended'
    user.save()

    machine_ids = Machines.objects.filter(owner=user).values_list('id', flat=True)
    Postings.objects.filter(machinery_id__in=machine_ids, status='active').update(status='suspended')
    Rentals.objects.filter(lessee=user, status='pending').update(status='cancelled')

    return Response({'message': f'Usuário {user.name} suspenso.'}, status=status.HTTP_200_OK)


@api_view(['PUT'])
def ban_user(request, pk):
    try:
        user = Users.objects.get(pk=pk)
    except Users.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    user.status = 'banned'
    user.save()

    machine_ids = Machines.objects.filter(owner=user).values_list('id', flat=True)
    Postings.objects.filter(machinery_id__in=machine_ids).exclude(status='inactive').update(status='inactive')
    rental_ids = Rentals.objects.filter(lessee=user, status__in=['pending', 'active']).values_list('id', flat=True)
    Rentals.objects.filter(id__in=rental_ids).update(status='cancelled')
    Contracts.objects.filter(rental_id__in=rental_ids, status='pending_signatures').update(status='cancelled')

    return Response({'message': f'Usuário {user.name} banido permanentemente.'}, status=status.HTTP_200_OK)

