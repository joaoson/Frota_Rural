import uuid
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from api.models import Contracts, Rentals, Reviews


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
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    @extend_schema_field(serializers.CharField(help_text='Número legível do contrato, ex.: #CTR-08E8'))
    def get_contract_number(self, obj):
        try:
            return f"#CTR-{str(obj.id)[:4].upper()}"
        except Exception:
            return ""

    def create(self, validated_data):
        now = timezone.now()
        validated_data.setdefault("id", uuid.uuid4())
        validated_data.setdefault("created_at", now)
        validated_data.setdefault("updated_at", now)
        validated_data.setdefault("status", "pending")
        return Rentals.objects.create(**validated_data)


class ContractSerializer(serializers.ModelSerializer):
    rental_details = RentalSerializer(source="rental", read_only=True)

    class Meta:
        model = Contracts
        fields = [
            "id",
            "rental",
            "document_url",
            "accepted_by_lessor",
            "accepted_by_lessee",
            "status",
            "created_at",
            "rental_details",
        ]
        read_only_fields = ["id", "created_at"]

    def create(self, validated_data):
        validated_data.setdefault("id", uuid.uuid4())
        validated_data.setdefault("created_at", timezone.now())
        validated_data.setdefault("status", "pending_signatures")
        return Contracts.objects.create(**validated_data)
