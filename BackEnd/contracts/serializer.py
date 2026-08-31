import uuid
from django.utils import timezone
from rest_framework import serializers

from api.serializer import RentalSerializer
from contracts.models import ContractSignatures, Contracts


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


class ContractSignatureSerializer(serializers.ModelSerializer):
    """Evidência do aceite, no formato em que ela é exibida e auditada."""

    class Meta:
        model = ContractSignatures
        fields = [
            "id",
            "contract",
            "role",
            "signer",
            "signer_name",
            "signer_email",
            "document_version",
            "document_hash",
            "hash_algorithm",
            "signed_at",
            "ip_address",
            "user_agent",
            "otp_verified",
            "previous_hash",
            "record_hash",
        ]
        # Toda a evidência é gravada pelo servidor: nada aqui vem do cliente.
        read_only_fields = fields
