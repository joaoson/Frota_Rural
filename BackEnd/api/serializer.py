import uuid

from django.utils import timezone
from rest_framework import serializers

from .models import Machines, Users, Postings, PostingsPhotos


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = Users
        fields = '__all__'
        extra_kwargs = {
            'password': {'write_only': True}  # Hide password in GET responses
        }

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = Users(**validated_data)
        user.set_password(password)
        user.save()
        return user


class MachineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Machines
        fields = [
            "id",
            "owner",
            "renagro_number",
            "brand",
            "model",
            "year",
            "technical_specifications",
            "usage_purpose",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def create(self, validated_data):
        now = timezone.now()
        validated_data.setdefault("status", "active")
        return Machines.objects.create(
            id=uuid.uuid4(),
            created_at=now,
            updated_at=now,
            **validated_data,
        )

    def update(self, instance, validated_data):
        validated_data["updated_at"] = timezone.now()
        return super().update(instance, validated_data)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={'input_type': 'password'})


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(min_length=8)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(min_length=8, write_only=True)


class PostingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Postings
        fields = [
            "id",
            "machinery",
            "hourly_rate",
            "location_lat",
            "location_lng",
            "location_address",
            "availability_start",
            "availability_end",
            "description",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

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
            "machine_brand",
            "machine_model",
            "machine_usage_purpose",
            "machine_year",
            "hourly_rate",
            "location_address",
            "availability_start",
            "availability_end",
            "description",
            "status",
            "primary_photo_url",
        ]

    def get_primary_photo_url(self, obj):
        photos = list(obj.postingsphotos_set.all())
        if not photos:
            return None
        primary = next((p for p in photos if p.is_primary), photos[0])
        return primary.image_url


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
            "location_address", "location_lat", "location_lng",
            "availability_start", "availability_end",
            "description", "status",
            "machine_brand", "machine_model", "machine_year",
            "machine_usage_purpose", "machine_technical_specifications", "machine_renagro_number",
            "photos",
        ]

    def get_photos(self, obj):
        photos = list(obj.postingsphotos_set.all())
        return [{"url": p.image_url, "is_primary": p.is_primary} for p in photos]