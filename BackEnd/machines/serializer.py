from collections.abc import Mapping
from typing import Any

from django.http import QueryDict
from rest_framework import serializers

from machines.enums import MachineStatus
from machines.models import Machines
from users.models import Users


POWER_CV_MIN = 20
POWER_CV_MAX = 700
HOUR_METER_MAX = 60000


class MachineInputSerializer(serializers.ModelSerializer[Machines]):
    """Campos da máquina que o cliente pode gravar."""

    class Meta:
        model = Machines
        fields = [
            "owner",
            "renagro_number",
            "brand",
            "model",
            "year",
            "power_cv",
            "hour_meter",
            "technical_specifications",
            "usage_purpose",
            "status",
        ]

    def validate_owner(self, value: Users) -> Users:
        actor = self.context.get("actor")
        if self.instance and value.pk != self.instance.owner_id:
            raise serializers.ValidationError("O proprietário não pode ser alterado após o cadastro.")
        if actor is not None and (value.pk != actor.pk or actor.role != "locador"):
            raise serializers.ValidationError("Cadastre a máquina em sua própria conta de locador.")
        return value

    def validate_power_cv(self, value: int | None) -> int | None:
        if value is not None and not POWER_CV_MIN <= value <= POWER_CV_MAX:
            raise serializers.ValidationError(f"A potência deve estar entre {POWER_CV_MIN} e {POWER_CV_MAX} cv.")
        return value

    def validate_hour_meter(self, value: int | None) -> int | None:
        if value is not None and value > HOUR_METER_MAX:
            raise serializers.ValidationError(f"O horímetro deve ser menor que {HOUR_METER_MAX} horas.")
        return value

    def to_internal_value(self, data: object) -> dict[str, Any]:
        """Canoniza o Renagro antes de qualquer validação de campo.

        `renagro_number` é UNIQUE no banco, e sem isto "br1029304899" e
        "BR1029304899" seriam dois registros distintos para o mesmo maquinário.

        A normalização precisa acontecer aqui, e não em `validate_renagro_number`:
        o `UniqueValidator` do DRF roda antes dos métodos `validate_<campo>`, e
        conferir a unicidade do valor cru deixaria passar um duplicado que só
        estouraria como IntegrityError na hora de gravar — em vez do 400 com o
        erro no campo que o cliente sabe tratar.
        """
        if isinstance(data, QueryDict):
            data = data.dict()
        if isinstance(data, Mapping):
            renagro = data.get("renagro_number")
            if isinstance(renagro, str):
                data = {**data, "renagro_number": renagro.strip().upper()}
        validated: dict[str, Any] = super().to_internal_value(data)
        return validated


class MachineOutputSerializer(serializers.ModelSerializer[Machines]):
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
            "technical_specifications",
            "usage_purpose",
            "status",
            "hour_meter_updated_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class MachineFilterSerializer(serializers.Serializer[Any]):
    """Query params aceitos na listagem de máquinas."""

    owner = serializers.UUIDField(required=False, help_text="ID do proprietário.")
    status = serializers.ChoiceField(
        choices=MachineStatus.choices, required=False, help_text="Status da máquina."
    )
    brand = serializers.CharField(required=False, help_text="Marca (sem diferenciar maiúsculas).")
    model = serializers.CharField(required=False, help_text="Modelo (sem diferenciar maiúsculas).")
