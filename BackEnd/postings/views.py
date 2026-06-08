from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import IntegrityError
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