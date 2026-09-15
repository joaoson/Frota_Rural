from typing import Any

from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator

from reviews.models import Reviews

DUPLICATE_REVIEW_MESSAGE = "Este avaliador já avaliou esta locação."


class ReviewInputSerializer(serializers.ModelSerializer[Reviews]):
    """Campos da avaliação que o cliente pode gravar."""

    class Meta:
        model = Reviews
        fields = ["rental", "reviewer", "reviewee", "rating", "comment"]
        extra_kwargs = {"rating": {"min_value": 1, "max_value": 5}}
        # Substitui o validador gerado a partir do unique_together só para trocar
        # a mensagem padrão, que o DRF escreve em inglês.
        validators = [
            UniqueTogetherValidator(
                queryset=Reviews.objects.all(),
                fields=["rental", "reviewer"],
                message=DUPLICATE_REVIEW_MESSAGE,
            )
        ]


class ReviewFilterSerializer(serializers.Serializer[Any]):
    """Query params aceitos na listagem de avaliações."""

    reviewee = serializers.UUIDField(required=False, help_text="ID do usuário avaliado.")
    reviewer = serializers.UUIDField(required=False, help_text="ID do usuário que avaliou.")
    rental = serializers.UUIDField(required=False, help_text="ID da locação.")


class ReviewOutputSerializer(serializers.ModelSerializer[Reviews]):
    reviewer_name = serializers.CharField(source="reviewer.name", read_only=True)
    reviewee_name = serializers.CharField(source="reviewee.name", read_only=True)

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
        read_only_fields = fields
