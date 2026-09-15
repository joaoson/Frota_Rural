from typing import Any

from django.core.exceptions import ObjectDoesNotExist
from rest_framework import serializers

from contracts.models import Contracts
from rentals.models import Rentals


class RentalInputSerializer(serializers.ModelSerializer[Rentals]):
    """Campos da locação que o cliente pode gravar.

    Aqui fica só a validação que depende do próprio payload. A checagem de
    conflito com outras reservas consulta o banco e mora no `RentalService`.
    """

    class Meta:
        model = Rentals
        fields = [
            "postings",
            "lessee",
            "operator",
            "start_date",
            "end_date",
            "total_price",
            "initial_hour_meter",
            "final_hour_meter",
            "status",
        ]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))
        posting = attrs.get("postings", getattr(self.instance, "postings", None))
        if start_date is None or end_date is None or posting is None:
            return attrs

        if end_date < start_date:
            raise serializers.ValidationError(
                {"end_date": "A data de fim deve ser posterior à data de início."}
            )

        max_days = posting.max_reservation_days
        total_days = (end_date.date() - start_date.date()).days + 1
        if max_days and total_days > max_days:
            raise serializers.ValidationError(
                {"end_date": f"Este anúncio permite reservas de no máximo {max_days} dias."}
            )
        return attrs


class RentalFilterSerializer(serializers.Serializer[Any]):
    """Query params aceitos na listagem de locações."""

    postings = serializers.UUIDField(required=False, help_text="ID do anúncio.")
    lessee = serializers.UUIDField(required=False, help_text="ID do locatário.")
    lessor = serializers.UUIDField(required=False, help_text="ID do locador dono do maquinário.")


class RentalOutputSerializer(serializers.ModelSerializer[Rentals]):
    lessee_name = serializers.CharField(source="lessee.name", read_only=True)
    lessor_name = serializers.CharField(source="postings.machinery.owner.name", read_only=True)
    machine_brand = serializers.CharField(source="postings.machinery.brand", read_only=True)
    machine_model = serializers.CharField(source="postings.machinery.model", read_only=True)
    contract_number = serializers.SerializerMethodField()
    # Estado do aceite eletrônico, para a tela saber qual parte ainda falta
    # assinar. `rentals.status` sozinho não distingue "o locador assinou" de
    # "o locatário assinou": ambos deixam o aluguel em `active`.
    contract_id = serializers.SerializerMethodField()
    contract_status = serializers.SerializerMethodField()
    accepted_by_lessor = serializers.SerializerMethodField()
    accepted_by_lessee = serializers.SerializerMethodField()

    class Meta:
        model = Rentals
        fields = [
            "id",
            "postings",
            "lessee",
            "operator",
            "start_date",
            "end_date",
            "total_price",
            "initial_hour_meter",
            "final_hour_meter",
            "status",
            "created_at",
            "updated_at",
            "lessee_name",
            "lessor_name",
            "machine_brand",
            "machine_model",
            "contract_number",
            "contract_id",
            "contract_status",
            "accepted_by_lessor",
            "accepted_by_lessee",
        ]
        read_only_fields = fields

    @staticmethod
    def _contract(obj: Rentals) -> Contracts | None:
        """Contrato do aluguel, ou None enquanto ele ainda não foi criado."""
        try:
            return obj.contracts
        except ObjectDoesNotExist:
            return None

    def get_contract_number(self, obj: Rentals) -> str:
        """Número legível do contrato, ex.: #CTR-08E8."""
        return f"#CTR-{str(obj.id)[:4].upper()}"

    def get_contract_id(self, obj: Rentals) -> str | None:
        contract = self._contract(obj)
        return str(contract.id) if contract else None

    def get_contract_status(self, obj: Rentals) -> str | None:
        contract = self._contract(obj)
        return contract.status if contract else None

    def get_accepted_by_lessor(self, obj: Rentals) -> bool:
        contract = self._contract(obj)
        return bool(contract.accepted_by_lessor) if contract else False

    def get_accepted_by_lessee(self, obj: Rentals) -> bool:
        contract = self._contract(obj)
        return bool(contract.accepted_by_lessee) if contract else False
