import re
from datetime import UTC, datetime
from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from djangoapi import firebase_storage
from postings.enums import PostingStatus
from postings.models import Postings, PostingsPhotos

# created_at é nullable no banco; usado como piso para manter a ordenação estável.
_EPOCH = datetime.min.replace(tzinfo=UTC)


def _sorted_photos(posting: Postings) -> list[PostingsPhotos]:
    """Capa primeiro, depois as demais na ordem de envio."""
    photos = list(posting.postingsphotos_set.all())
    return sorted(photos, key=lambda p: (not p.is_primary, p.created_at or _EPOCH))


# --- Entrada ----------------------------------------------------------------


class PostingInputSerializer(serializers.ModelSerializer[Postings]):
    """Campos do anúncio que o locador pode gravar."""

    # Declarado à mão porque o modelo guarda 8 dígitos, mas o formulário envia
    # com máscara ("80010-010", 9 caracteres). Sem isto, o `max_length` do
    # modelo recusaria o valor mascarado antes da normalização abaixo.
    location_cep = serializers.CharField(
        max_length=9, required=False, allow_blank=True, allow_null=True
    )
    max_reservation_days = serializers.IntegerField(required=False, allow_null=True, min_value=1)

    class Meta:
        model = Postings
        fields = [
            "machinery",
            "hourly_rate",
            "location_lat",
            "location_lng",
            "location_cep",
            "location_address",
            "availability_start",
            "availability_end",
            "max_reservation_days",
            "description",
            "status",
        ]

    def validate_location_cep(self, value: str | None) -> str | None:
        """Normaliza o CEP para 8 dígitos.

        O formulário envia com máscara ("80000-000"); guardar só os dígitos
        evita que o mesmo CEP fique gravado de duas formas e quebre a busca.
        """
        if value in (None, ""):
            return None
        digits = re.sub(r"\D", "", value or "")
        if len(digits) != 8:  # noqa: PLR2004
            raise serializers.ValidationError("O CEP deve ter 8 dígitos.")
        return digits


class PostingFilterSerializer(serializers.Serializer[Any]):
    """Query params aceitos na listagem de anúncios."""

    machinery = serializers.UUIDField(required=False, help_text="Máquina anunciada.")
    status = serializers.ChoiceField(
        choices=PostingStatus.choices, required=False, help_text="Status do anúncio."
    )
    available_from = serializers.DateField(
        required=False, help_text="Disponível a partir de (YYYY-MM-DD)."
    )
    available_until = serializers.DateField(
        required=False, help_text="Disponível até (YYYY-MM-DD)."
    )


class PostingPhotoUploadInputSerializer(serializers.Serializer[Any]):
    """Campos de formulário do upload de foto, além do arquivo em `image`."""

    is_primary = serializers.BooleanField(
        required=False, default=False, help_text="Usa a foto como capa do anúncio."
    )


# --- Saída ------------------------------------------------------------------


class PostingOutputSerializer(serializers.ModelSerializer[Postings]):
    """Anúncio como devolvido após criação ou edição."""

    class Meta:
        model = Postings
        fields = [
            "id",
            "machinery",
            "hourly_rate",
            "location_lat",
            "location_lng",
            "location_cep",
            "location_address",
            "availability_start",
            "availability_end",
            "max_reservation_days",
            "description",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class PostingPhotoUrlSerializer(serializers.Serializer[Any]):
    """Foto do anúncio no formato embutido em `PostingDetailOutputSerializer.photos`."""

    url = serializers.CharField()
    is_primary = serializers.BooleanField()


class PostingListOutputSerializer(serializers.ModelSerializer[Postings]):
    machine_brand = serializers.CharField(source="machinery.brand", default=None, read_only=True)
    machine_model = serializers.CharField(source="machinery.model", default=None, read_only=True)
    machine_usage_purpose = serializers.CharField(
        source="machinery.usage_purpose", default=None, read_only=True
    )
    machine_year = serializers.IntegerField(
        source="machinery.year", allow_null=True, read_only=True
    )
    primary_photo_url = serializers.SerializerMethodField()

    class Meta:
        model = Postings
        fields = [
            "id",
            "machinery",
            "machine_brand",
            "machine_model",
            "machine_usage_purpose",
            "machine_year",
            "hourly_rate",
            "location_cep",
            "location_address",
            "availability_start",
            "availability_end",
            "max_reservation_days",
            "description",
            "status",
            "primary_photo_url",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_primary_photo_url(self, obj: Postings) -> str | None:
        photos = _sorted_photos(obj)
        if not photos:
            return None
        return firebase_storage.public_url(photos[0].image_url)


class PostingDetailOutputSerializer(serializers.ModelSerializer[Postings]):
    machine_brand = serializers.CharField(source="machinery.brand", default=None, read_only=True)
    machine_model = serializers.CharField(source="machinery.model", default=None, read_only=True)
    machine_year = serializers.IntegerField(
        source="machinery.year", allow_null=True, read_only=True
    )
    machine_usage_purpose = serializers.CharField(
        source="machinery.usage_purpose", default=None, read_only=True
    )
    machine_technical_specifications = serializers.CharField(
        source="machinery.technical_specifications", default=None, read_only=True
    )
    machine_renagro_number = serializers.CharField(
        source="machinery.renagro_number", default=None, read_only=True
    )
    photos = serializers.SerializerMethodField()

    class Meta:
        model = Postings
        fields = [
            "id",
            "hourly_rate",
            "location_cep",
            "location_address",
            "location_lat",
            "location_lng",
            "availability_start",
            "availability_end",
            "max_reservation_days",
            "description",
            "status",
            "machine_brand",
            "machine_model",
            "machine_year",
            "machine_usage_purpose",
            "machine_technical_specifications",
            "machine_renagro_number",
            "photos",
        ]
        read_only_fields = fields

    @extend_schema_field(PostingPhotoUrlSerializer(many=True))
    def get_photos(self, obj: Postings) -> list[dict[str, str | bool | None]]:
        return [
            {
                "url": firebase_storage.public_url(photo.image_url),
                "is_primary": bool(photo.is_primary),
            }
            for photo in _sorted_photos(obj)
        ]


class PostingPhotoUploadOutputSerializer(serializers.ModelSerializer[PostingsPhotos]):
    """Foto recém-enviada: caminho no bucket e URL pública já montada."""

    path = serializers.CharField(source="image_url", read_only=True)
    url = serializers.SerializerMethodField()

    class Meta:
        model = PostingsPhotos
        fields = ["id", "path", "url", "is_primary"]
        read_only_fields = fields

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_url(self, obj: PostingsPhotos) -> str | None:
        return firebase_storage.public_url(obj.image_url)
