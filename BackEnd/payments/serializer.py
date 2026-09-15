from typing import Any

from rest_framework import serializers

from payments.models import Payments
from rentals.enums import RentalStatus


class CheckoutOutputSerializer(serializers.Serializer[Any]):
    url = serializers.CharField(help_text="Página de pagamento do Stripe.")
    amount = serializers.DecimalField(
        max_digits=10, decimal_places=2, help_text="Valor cobrado, recalculado no servidor."
    )


class PaymentStatusOutputSerializer(serializers.ModelSerializer[Payments]):
    rental_status = serializers.ChoiceField(
        source="rental.status", choices=RentalStatus.choices, read_only=True
    )

    class Meta:
        model = Payments
        fields = ["status", "amount", "rental_status"]
        read_only_fields = fields


class OccupiedPeriodSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    start_date = serializers.DateTimeField()
    end_date = serializers.DateTimeField()
    status = serializers.ChoiceField(choices=RentalStatus.choices)


class OccupancyOutputSerializer(serializers.Serializer[Any]):
    ocupados = OccupiedPeriodSerializer(many=True)
