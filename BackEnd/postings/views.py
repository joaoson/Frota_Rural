from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
import uuid
from .models import (
    Postings,
    PostingsPhotos
)
from .serializer import (
    PostingDetailSerializer,
    PostingListSerializer,
    PostingSerializer,
)
from djangoapi import firebase_storage

MAX_PHOTO_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp"}

# Create your views here.
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
        # Sem corpo multipart o Django nem chega a popular request.FILES. Vale
        # distinguir os dois casos: o cliente que erra o Content-Type recebe uma
        # mensagem que aponta a causa, em vez de "nenhum arquivo".
        content_type = (request.content_type or "").split(";")[0].strip()
        if content_type != "multipart/form-data":
            return Response(
                {
                    "error": (
                        "A requisição precisa ser multipart/form-data; foi recebido "
                        f"'{content_type or 'nenhum Content-Type'}'."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {"error": "Nenhum arquivo enviado."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if image_file.content_type not in ALLOWED_PHOTO_TYPES:
        return Response(
            {
                "error": (
                    "Tipo de arquivo não suportado. Envie JPG, PNG ou WEBP "
                    f"(recebido: '{image_file.content_type}')."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if image_file.size > MAX_PHOTO_BYTES:
        megabytes = image_file.size / (1024 * 1024)
        return Response(
            {
                "error": (
                    f"'{image_file.name}' tem {megabytes:.1f}MB e excede o "
                    "máximo de 5MB."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        image_path = firebase_storage.upload_image(image_file, folder=f"postings/{posting.id}")
    except firebase_storage.FirebaseStorageNotConfigured as error:
        return Response({"error": str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except Exception:
        return Response(
            {"error": "Erro ao enviar a imagem para o Firebase."},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    is_primary_raw = request.data.get("is_primary", "false")
    is_primary = str(is_primary_raw).lower() in ("true", "1")

    # Só uma foto por anúncio pode ser a capa.
    with transaction.atomic():
        if is_primary:
            PostingsPhotos.objects.filter(postings=posting, is_primary=True).update(is_primary=False)
        photo = PostingsPhotos.objects.create(
            id=uuid.uuid4(),
            postings=posting,
            image_url=image_path,
            is_primary=is_primary,
            created_at=timezone.now(),
        )

    return Response(
        {
            "id": str(photo.id),
            "path": photo.image_url,
            "url": firebase_storage.public_url(photo.image_url),
            "is_primary": photo.is_primary,
        },
        status=status.HTTP_201_CREATED,
    )
