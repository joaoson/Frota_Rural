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

    def to_internal_value(self, data):
        """Canoniza o Renagro antes de qualquer validação de campo.

        `renagro_number` é UNIQUE no banco, e sem isto "br1029304899" e
        "BR1029304899" seriam dois registros distintos para o mesmo maquinário.

        A normalização precisa acontecer aqui, e não em `validate_renagro_number`:
        o `UniqueValidator` do DRF roda antes dos métodos `validate_<campo>`, e
        conferir a unicidade do valor cru deixaria passar um duplicado que só
        estouraria como IntegrityError (500) na hora de gravar — em vez do 400
        que o cliente sabe tratar.
        """
        renagro = data.get("renagro_number")
        if isinstance(renagro, str):
            data = {**data.items()} if hasattr(data, "getlist") else {**data}
            data["renagro_number"] = renagro.strip().upper()
        return super().to_internal_value(data)

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