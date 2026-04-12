from django.db import IntegrityError
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from .models import Users, Machines, Postings, Rentals, Contracts
from .serializer import MachineSerializer, UserSerializer, PostingSerializer

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


def _machines_queryset():
    return Machines.objects.all().select_related("owner")


@api_view(["GET", "POST"])
def machines_list(request):
    if request.method == "GET":
        qs = _machines_queryset().order_by("-created_at", "-id")
        owner_id = request.query_params.get("owner")
        if owner_id:
            qs = qs.filter(owner_id=owner_id)
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        brand = request.query_params.get("brand")
        if brand:
            qs = qs.filter(brand__iexact=brand)
        model = request.query_params.get("model")
        if model:
            qs = qs.filter(model__iexact=model)
        serializer = MachineSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    serializer = MachineSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    try:
        serializer.save()
    except IntegrityError:
        return Response(
            {"error": "Dados inválidos ou em conflito (ex.: renagro_number já cadastrado)."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
def machine_detail(request, pk):
    try:
        machine = _machines_queryset().get(pk=pk)
    except Machines.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(MachineSerializer(machine).data, status=status.HTTP_200_OK)

    if request.method == "PUT":
        serializer = MachineSerializer(machine, data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            serializer.save()
        except IntegrityError:
            return Response(
                {"error": "Dados inválidos ou em conflito (ex.: renagro_number já cadastrado)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(serializer.data, status=status.HTTP_200_OK)

    if request.method == "PATCH":
        serializer = MachineSerializer(machine, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            serializer.save()
        except IntegrityError:
            return Response(
                {"error": "Dados inválidos ou em conflito (ex.: renagro_number já cadastrado)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(serializer.data, status=status.HTTP_200_OK)

    try:
        machine.delete()
    except IntegrityError:
        return Response(
            {
                "error": "Não é possível excluir esta máquina: existem registros dependentes (ex.: anúncios).",
            },
            status=status.HTTP_409_CONFLICT,
        )
    return Response(status=status.HTTP_204_NO_CONTENT)


def _postings_queryset():
    return Postings.objects.all().select_related("machinery", "machinery__owner")


@api_view(["GET", "POST"])
def postings_list(request):
    if request.method == "GET":
        qs = _postings_queryset().order_by("-created_at", "-id")
        machinery_id = request.query_params.get("machinery")
        if machinery_id:
            qs = qs.filter(machinery_id=machinery_id)
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        serializer = PostingSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    serializer = PostingSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    try:
        serializer.save()
    except IntegrityError:
        return Response(
            {"error": "Dados inválidos ou em conflito."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
def posting_detail(request, pk):
    try:
        posting = _postings_queryset().get(pk=pk)
    except Postings.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(PostingSerializer(posting).data, status=status.HTTP_200_OK)

    if request.method == "PUT":
        serializer = PostingSerializer(posting, data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            serializer.save()
        except IntegrityError:
            return Response(
                {"error": "Dados inválidos ou em conflito."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(serializer.data, status=status.HTTP_200_OK)

    if request.method == "PATCH":
        serializer = PostingSerializer(posting, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            serializer.save()
        except IntegrityError:
            return Response(
                {"error": "Dados inválidos ou em conflito."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(serializer.data, status=status.HTTP_200_OK)

    try:
        posting.delete()
    except IntegrityError:
        return Response(
            {
                "error": "Não é possível excluir este anúncio: existem registros dependentes.",
            },
            status=status.HTTP_409_CONFLICT,
        )
    return Response(status=status.HTTP_204_NO_CONTENT)
