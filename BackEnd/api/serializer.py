import uuid
from datetime import timedelta
from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from api.models import Rentals, Reviews


class ReviewSerializer(serializers.ModelSerializer):
    reviewer_name = serializers.CharField(source='reviewer.name', read_only=True)
    reviewee_name = serializers.CharField(source='reviewee.name', read_only=True)

    class Meta:
        model = Reviews
        fields = [
            "id",
            "rental",
            "reviewer",
            "reviewer_name",
            "reviewee",
            "reviewee_name",
            "rating",
            "comment",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def create(self, validated_data):
        return Reviews.objects.create(
            id=uuid.uuid4(),
            created_at=timezone.now(),
            **validated_data,
        )


class RentalSerializer(serializers.ModelSerializer):
    lessee_name = serializers.CharField(source="lessee.name", read_only=True)
    lessor_name = serializers.CharField(source="postings.machinery.owner.name", read_only=True)
    machine_brand = serializers.CharField(source="postings.machinery.brand", read_only=True)
    machine_model = serializers.CharField(source="postings.machinery.model", read_only=True)
    contract_number = serializers.SerializerMethodField(read_only=True)
    # Estado do aceite eletrônico, para a tela saber qual parte ainda falta
    # assinar. `rentals.status` sozinho não distingue "o locador assinou" de
    # "o locatário assinou": ambos deixam o aluguel em `active`.
    contract_id = serializers.SerializerMethodField(read_only=True)
    contract_status = serializers.SerializerMethodField(read_only=True)
    accepted_by_lessor = serializers.SerializerMethodField(read_only=True)
    accepted_by_lessee = serializers.SerializerMethodField(read_only=True)

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
        read_only_fields = ["id", "created_at", "updated_at"]

    @extend_schema_field(serializers.CharField(help_text='Número legível do contrato, ex.: #CTR-08E8'))
    def get_contract_number(self, obj):
        try:
            return f"#CTR-{str(obj.id)[:4].upper()}"
        except Exception:
            return ""

    @staticmethod
    def _contract(obj):
        """Contrato do aluguel, ou None enquanto ele ainda não foi criado."""
        try:
            return obj.contracts
        except ObjectDoesNotExist:
            return None

    def get_contract_id(self, obj):
        contract = self._contract(obj)
        return str(contract.id) if contract else None

    def get_contract_status(self, obj):
        contract = self._contract(obj)
        return contract.status if contract else None

    def get_accepted_by_lessor(self, obj):
        contract = self._contract(obj)
        return bool(contract.accepted_by_lessor) if contract else False

    def get_accepted_by_lessee(self, obj):
        contract = self._contract(obj)
        return bool(contract.accepted_by_lessee) if contract else False

    def create(self, validated_data):
        now = timezone.now()
        validated_data.setdefault("id", uuid.uuid4())
        validated_data.setdefault("created_at", now)
        validated_data.setdefault("updated_at", now)
        validated_data.setdefault("status", "pending")
        return Rentals.objects.create(**validated_data)

    def validate(self, attrs):
        """Keep a day free before and after each rental for machine turnaround."""
        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))
        posting = attrs.get("postings", getattr(self.instance, "postings", None))

        if not start_date or not end_date or not posting:
            return attrs
        if end_date < start_date:
            raise serializers.ValidationError({"end_date": "A data de fim deve ser posterior à data de início."})

        max_reservation_days = posting.max_reservation_days
        total_days = (end_date.date() - start_date.date()).days + 1
        if max_reservation_days and total_days > max_reservation_days:
            raise serializers.ValidationError(
                {"end_date": f"Este anúncio permite reservas de no máximo {max_reservation_days} dias."}
            )

        # A requested range cannot touch an existing reservation's cleaning buffer.
        conflicting_rentals = Rentals.objects.filter(
            postings=posting,
            status__in=["pending", "active", "signed"],
            start_date__lte=end_date + timedelta(days=1),
            end_date__gte=start_date - timedelta(days=1),
        )
        if self.instance:
            conflicting_rentals = conflicting_rentals.exclude(pk=self.instance.pk)
        if conflicting_rentals.exists():
            raise serializers.ValidationError(
                {"non_field_errors": "O período selecionado conflita com uma reserva ou com o intervalo de limpeza da máquina."}
            )

        return attrs
