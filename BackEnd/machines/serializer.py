import uuid
from django.utils import timezone
from rest_framework import serializers
from .models import Machines

# Faixas plausíveis para maquinário agrícola. Ficam aqui, e não em `pricing`,
# porque valem para o cadastro em si — mesmo sem nenhuma sugestão de preço.
POWER_CV_MIN = 20
POWER_CV_MAX = 700
HOUR_METER_MAX = 60000

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
            "power_cv",
            "hour_meter",
            "hour_meter_updated_at",
            "technical_specifications",
            "usage_purpose",
            "status",
            "created_at",
            "updated_at",
        ]
        # `hour_meter_updated_at` é carimbado pelo servidor: é ele que diz há
        # quanto tempo a leitura do horímetro é confiável, e deixá-lo no cliente
        # permitiria declarar uma leitura velha como recente.
        read_only_fields = ["id", "created_at", "updated_at", "hour_meter_updated_at"]

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

    def validate_power_cv(self, value):
        """Faixa plausível para maquinário agrícola.

        Serve de guarda-corpo para a precificação: `power_cv` normaliza os
        comparáveis e estima o consumo de diesel, então um valor absurdo aqui
        vira um preço absurdo lá.
        """
        if value is not None and not (POWER_CV_MIN <= value <= POWER_CV_MAX):
            raise serializers.ValidationError(
                f"A potência deve estar entre {POWER_CV_MIN} e {POWER_CV_MAX} cv."
            )
        return value

    def validate_hour_meter(self, value):
        if value is not None and value > HOUR_METER_MAX:
            raise serializers.ValidationError(
                f"O horímetro deve ser menor que {HOUR_METER_MAX} horas."
            )
        return value

    def create(self, validated_data):
        now = timezone.now()
        validated_data.setdefault("status", "active")
        if validated_data.get("hour_meter") is not None:
            validated_data["hour_meter_updated_at"] = now
        return Machines.objects.create(
            id=uuid.uuid4(),
            created_at=now,
            updated_at=now,
            **validated_data,
        )

    def update(self, instance, validated_data):
        now = timezone.now()
        # Só re-carimba quando a leitura muda de fato. Um PATCH que reenvia o
        # mesmo horímetro não deve rejuvenescer a data e fazer uma leitura de um
        # ano atrás parecer recente para a precificação.
        if (
            "hour_meter" in validated_data
            and validated_data["hour_meter"] != instance.hour_meter
        ):
            validated_data["hour_meter_updated_at"] = now
        validated_data["updated_at"] = now
        return super().update(instance, validated_data)