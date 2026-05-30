import uuid
from django.utils import timezone
from rest_framework import serializers
from .models import Machines

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