from typing import Any

from rest_framework import serializers

from payments.models import Payments
from rentals.enums import RentalStatus


class CheckoutOutputSerializer(serializers.Serializer[Any]):
    url = serializers.CharField(help_text="Página de pagamento do Stripe.")
    amount = serializers.DecimalField(
        max_digits=10, decimal_places=2, help_text="Valor em reais preservado na cotação da reserva; não é informado pelo cliente."
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


class QuoteInputSerializer(serializers.Serializer[Any]):
    start_date = serializers.DateTimeField(help_text="Início da locação.")
    end_date = serializers.DateTimeField(help_text="Fim da locação.")

    def validate(self, attrs):
        if attrs["end_date"] < attrs["start_date"]:
            raise serializers.ValidationError({"end_date": "A data de fim deve ser posterior à data de início."})
        return attrs


class QuoteOutputSerializer(serializers.Serializer[Any]):
    """Preço por diária fixa (tarifa × 8 h); o horímetro não entra no cálculo."""

    tarifa_hora = serializers.DecimalField(max_digits=10, decimal_places=2)
    horas_por_diaria = serializers.IntegerField()
    valor_diaria = serializers.DecimalField(max_digits=10, decimal_places=2)
    diarias = serializers.IntegerField()
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2)
    taxa_percentual = serializers.DecimalField(max_digits=5, decimal_places=4)
    taxa_valor = serializers.DecimalField(max_digits=10, decimal_places=2)
    total = serializers.DecimalField(max_digits=10, decimal_places=2)
