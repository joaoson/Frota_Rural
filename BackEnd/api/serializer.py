import uuid

from django.contrib.auth.hashers import make_password
from django.utils import timezone
from rest_framework import serializers

from .models import Machines, Users, Postings


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = Users
        fields = '__all__'
        extra_kwargs = {
            'password': {'write_only': True}  # Hide password in GET responses
        }

    def create(self, validated_data):
        validated_data['password'] = make_password(validated_data['password'])
        return super(UserSerializer, self).create(validated_data)


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