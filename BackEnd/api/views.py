import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import IntegrityError
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .email import send_password_reset_email
from .models import Contracts, Machines, PasswordResets, Postings, PostingsPhotos, Rentals, Users
from .serializer import (
    LoginSerializer,
    MachineSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    PostingDetailSerializer,
    PostingListSerializer,
    PostingSerializer,
    UserSerializer,
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

## - AUTH
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


@api_view(['POST'])
def logout_view(request):
    response = Response(status=status.HTTP_204_NO_CONTENT)
    response.delete_cookie('refresh_token', path='/api/login')
    return response


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
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    elif request.method == 'PATCH':
        serializer = UserSerializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    elif request.method == 'DELETE':
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    return Response(status=status.HTTP_400_BAD_REQUEST)

# TODO: ROLE FIELD SHOULD MATCH ONE THE ENUMS
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
    return Machines.objects.all()


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
    return (
        Postings.objects.all()
        .select_related("machinery")
        .prefetch_related("postingsphotos_set")
    )


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
        # Filtro de data: sobreposição entre disponibilidade da máquina e o período solicitado.
        # NULLs são tratados como "sem restrição" (máquina sem data definida aparece sempre).
        available_from = request.query_params.get("available_from")
        if available_from:
            # Exclui máquinas cuja disponibilidade TERMINOU antes da data de início informada
            qs = qs.filter(
                Q(availability_end__isnull=True) |
                Q(availability_end__date__gte=available_from)
            )
        available_until = request.query_params.get("available_until")
        if available_until:
            # Exclui máquinas que só COMEÇAM depois da data de fim informada
            qs = qs.filter(
                Q(availability_start__isnull=True) |
                Q(availability_start__date__lte=available_until)
            )
        serializer = PostingListSerializer(qs, many=True)
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
        return Response(PostingDetailSerializer(posting).data, status=status.HTTP_200_OK)

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


@api_view(["POST"])
def posting_photos(request, pk):
    try:
        posting = Postings.objects.get(pk=pk)
    except Postings.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    image_file = request.FILES.get("image")
    if not image_file:
        return Response({"error": "Nenhum arquivo enviado."}, status=status.HTTP_400_BAD_REQUEST)

    ext = image_file.name.rsplit(".", 1)[-1].lower() if "." in image_file.name else "jpg"
    filename = f"{uuid.uuid4()}.{ext}"
    saved_path = default_storage.save(f"posting_photos/{filename}", ContentFile(image_file.read()))
    image_url = request.build_absolute_uri(settings.MEDIA_URL + saved_path)

    is_primary_raw = request.data.get("is_primary", "false")
    is_primary = str(is_primary_raw).lower() in ("true", "1")

    photo = PostingsPhotos.objects.create(
        id=uuid.uuid4(),
        postings=posting,
        image_url=image_url,
        is_primary=is_primary,
        created_at=timezone.now(),
    )

    return Response(
        {"id": str(photo.id), "image_url": photo.image_url, "is_primary": photo.is_primary},
        status=status.HTTP_201_CREATED,
    )
