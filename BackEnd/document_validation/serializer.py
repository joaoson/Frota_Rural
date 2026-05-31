import uuid
from django.utils import timezone
from rest_framework import serializers
from .models import OperatorLicense, Certification


class OperatorLicenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = OperatorLicense
        fields = [
            "id",
            "user",
            "name",
            "birth_date",
            "cpf",
            "rg",
            "mother_name",
            "father_name",
            "nationality",
            "birth_place",
            "cnh_number",
            "category",
            "first_license_date",
            "issue_date",
            "expiration_date",
            "issuing_state",
            "issuing_authority",
            "situation",
            "acc",
            "ear",
            "medical_restrictions",
            "observations",
            "points",
            "file_url",
            "validation_status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def create(self, validated_data):
        now = timezone.now()
        validated_data.setdefault("validation_status", "pending")
        return OperatorLicense.objects.create(
            id=uuid.uuid4(),
            created_at=now,
            updated_at=now,
            **validated_data,
        )

    def update(self, instance, validated_data):
        validated_data["updated_at"] = timezone.now()
        return super().update(instance, validated_data)


class CertificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Certification
        fields = [
            "id",
            "user",
            "issuing_organization",
            "title",
            "issue_date",
            "credential_code",
            "description",
            "media_url",
            "validation_status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def create(self, validated_data):
        now = timezone.now()
        validated_data.setdefault("validation_status", "pending")
        return Certification.objects.create(
            id=uuid.uuid4(),
            created_at=now,
            updated_at=now,
            **validated_data,
        )

    def update(self, instance, validated_data):
        validated_data["updated_at"] = timezone.now()
        return super().update(instance, validated_data)
