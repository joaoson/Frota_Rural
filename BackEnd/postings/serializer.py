import re
import uuid
from datetime import datetime, timezone as dt_timezone
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from .models import (
    Postings,
    PostingsPhotos
)
from djangoapi import firebase_storage


# created_at é nullable no banco; usado como piso para manter a ordenação estável.
_EPOCH = datetime.min.replace(tzinfo=dt_timezone.utc)


def _sorted_photos(posting):
    """Capa primeiro, depois as demais na ordem de envio."""
    photos = list(posting.postingsphotos_set.all())
    return sorted(photos, key=lambda p: (not p.is_primary, p.created_at or _EPOCH))

class PostingPhotoUrlSerializer(serializers.Serializer):
    """Foto do anúncio no formato embutido em `PostingDetailSerializer.photos`."""

    url = serializers.CharField()
    is_primary = serializers.BooleanField()


class PostingSerializer(serializers.ModelSerializer):
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
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_location_cep(self, value):
        """Normaliza o CEP para 8 dígitos.

        O formulário envia com máscara ("80000-000"); guardar só os dígitos
        evita que o mesmo CEP fique gravado de duas formas e quebre a busca.
        """
        if value in (None, ""):
            return None
        digits = re.sub(r"\D", "", value)
        if len(digits) != 8:
            raise serializers.ValidationError("O CEP deve ter 8 dígitos.")
        return digits

    def create(self, validated_data):
        now = timezone.now()
        validated_data.setdefault("status", "active")
        return Postings.objects.create(
            id=uuid.uuid4(),
            created_at=now,
            updated_at=now,
            **validated_data,
        )

    def update(self, instance, validated_data):
        validated_data["updated_at"] = timezone.now()
        return super().update(instance, validated_data)

class PostingListSerializer(serializers.ModelSerializer):

    machine_brand         = serializers.CharField(source="machinery.brand",         default=None, read_only=True)
    machine_model         = serializers.CharField(source="machinery.model",         default=None, read_only=True)
    machine_usage_purpose = serializers.CharField(source="machinery.usage_purpose", default=None, read_only=True)
    machine_year          = serializers.IntegerField(source="machinery.year",       allow_null=True, read_only=True)
    primary_photo_url     = serializers.SerializerMethodField()

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

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_primary_photo_url(self, obj):
        photos = _sorted_photos(obj)
        if not photos:
            return None
        return firebase_storage.public_url(photos[0].image_url)

class PostingDetailSerializer(serializers.ModelSerializer):
    machine_brand                    = serializers.CharField(source="machinery.brand",                    default=None, read_only=True)
    machine_model                    = serializers.CharField(source="machinery.model",                    default=None, read_only=True)
    machine_year                     = serializers.IntegerField(source="machinery.year",                  allow_null=True, read_only=True)
    machine_usage_purpose            = serializers.CharField(source="machinery.usage_purpose",            default=None, read_only=True)
    machine_technical_specifications = serializers.CharField(source="machinery.technical_specifications", default=None, read_only=True)
    machine_renagro_number           = serializers.CharField(source="machinery.renagro_number",           default=None, read_only=True)
    photos                           = serializers.SerializerMethodField()

    class Meta:
        model = Postings
        fields = [
            "id", "hourly_rate",
            "location_cep", "location_address", "location_lat", "location_lng",
            "availability_start", "availability_end", "max_reservation_days",
            "description", "status",
            "machine_brand", "machine_model", "machine_year",
            "machine_usage_purpose", "machine_technical_specifications", "machine_renagro_number",
            "photos",
        ]

    @extend_schema_field(PostingPhotoUrlSerializer(many=True))
    def get_photos(self, obj):
        return [
            {
                "url": firebase_storage.public_url(p.image_url),
                "is_primary": bool(p.is_primary),
            }
            for p in _sorted_photos(obj)
        ]

class PostingPhotoSerializer(serializers.ModelSerializer):
    """Foto vinculada a um anúncio, no formato devolvido pelo endpoint de upload."""

    class Meta:
        model = PostingsPhotos
        fields = ["id", "image_url", "is_primary"]
        read_only_fields = ["id", "image_url", "is_primary"]
