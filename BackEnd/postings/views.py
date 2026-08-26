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
from api.schemas import ErrorResponseSerializer
from .serializer import (
    PostingDetailSerializer,
    PostingListSerializer,
    PostingPhotoSerializer,
    PostingSerializer,
)
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiExample, OpenApiResponse, OpenApiParameter

# Create your views here.
def _postings_queryset():
    return (
        Postings.objects.all()
        .select_related("machinery")
        .prefetch_related("postingsphotos_set")
    )


POSTING_NOT_FOUND = OpenApiResponse(description="Anúncio não encontrado.")
POSTING_INVALID = OpenApiResponse(
    response=ErrorResponseSerializer,
    description="Dados inválidos ou em conflito.",
)


@extend_schema_view(
    get=extend_schema(
        tags=['Anúncios'],
        summary="Listar anúncios",
        description=(
            "Retorna os anúncios de locação com a foto principal e os dados da máquina já embutidos.\n\n"
            "Os filtros de data consideram a sobreposição entre o período informado e a "
            "disponibilidade do anúncio; anúncios sem data definida aparecem em qualquer busca."
        ),
        parameters=[
            OpenApiParameter('machinery', type=str, description='Filtrar pela máquina anunciada'),
            OpenApiParameter('status', type=str, description='Status do anúncio (active, draft)'),
            OpenApiParameter('available_from', type=str, description='Disponível a partir de (YYYY-MM-DD)'),
            OpenApiParameter('available_until', type=str, description='Disponível até (YYYY-MM-DD)'),
        ],
        responses={200: PostingListSerializer(many=True)},
    ),
    post=extend_schema(
        tags=['Anúncios'],
        summary="Criar anúncio",
        description="Publica uma máquina já cadastrada para locação, com valor por hora, localização e janela de disponibilidade.",
        request=PostingSerializer,
        responses={201: PostingSerializer, 400: POSTING_INVALID},
        examples=[
            OpenApiExample(
                'Novo Anúncio de Máquina',
                summary='Colocar uma máquina disponível para locação',
                value={
                    "machinery": "123e4567-e89b-12d3-a456-426614174000",
                    "hourly_rate": "180.50",
                    "location_latitude": -25.0945,
                    "location_longitude": -50.1633,
                    "location_address": "Fazenda São Jorge, Castro - PR",
                    "availability_start": "2026-09-01T00:00:00Z",
                    "availability_end": "2026-12-31T23:59:59Z",
                    "status": "active"
                },
                request_only=True
            )
        ],
    ),
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


@extend_schema_view(
    get=extend_schema(
        tags=['Anúncios'],
        summary="Consultar anúncio",
        description="Retorna o anúncio com os dados completos da máquina, incluindo as especificações técnicas.",
        responses={200: PostingDetailSerializer, 404: POSTING_NOT_FOUND},
    ),
    put=extend_schema(
        tags=['Anúncios'],
        summary="Substituir anúncio",
        request=PostingSerializer,
        responses={200: PostingSerializer, 400: POSTING_INVALID, 404: POSTING_NOT_FOUND},
    ),
    patch=extend_schema(
        tags=['Anúncios'],
        summary="Atualizar anúncio parcialmente",
        description="Usado para ajustar preço, disponibilidade ou status (ex.: pausar o anúncio) sem reenviar todos os campos.",
        request=PostingSerializer,
        responses={200: PostingSerializer, 400: POSTING_INVALID, 404: POSTING_NOT_FOUND},
    ),
    delete=extend_schema(
        tags=['Anúncios'],
        summary="Excluir anúncio",
        responses={
            204: OpenApiResponse(description="Anúncio excluído."),
            404: POSTING_NOT_FOUND,
            409: OpenApiResponse(
                response=ErrorResponseSerializer,
                description="Existem registros dependentes (ex.: locações) impedindo a exclusão.",
            ),
        },
    ),
)
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


@extend_schema(
    tags=['Anúncios'],
    summary="Enviar foto do anúncio",
    description=(
        "Envia uma foto para o anúncio via `multipart/form-data`. Marque `is_primary` como `true` "
        "para usá-la como imagem de capa nas listagens."
    ),
    request={"multipart/form-data": {"type": "object", "properties": {"image": {"type": "string", "format": "binary"}, "is_primary": {"type": "boolean"}}}},
    responses={
        201: PostingPhotoSerializer,
        400: OpenApiResponse(response=ErrorResponseSerializer, description="Nenhum arquivo enviado."),
        404: POSTING_NOT_FOUND,
    }
)
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