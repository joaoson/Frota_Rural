from typing import Any

from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator

from reviews.models import CriterioAvaliacao, Reviews

DUPLICATE_REVIEW_MESSAGE = "Este avaliador já avaliou esta locação."


class ReviewInputSerializer(serializers.ModelSerializer[Reviews]):
    """Campos da avaliação que o cliente pode gravar."""

    class Meta:
        model = Reviews
        fields = ["rental", "reviewer", "reviewee", "rating", "comment", "criterio"]
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


    def validate(self, attrs):
        user = self.context.get('user')
        rental = attrs.get('rental', getattr(self.instance, 'rental', None))
        reviewer = attrs.get('reviewer', getattr(self.instance, 'reviewer', None))
        reviewee = attrs.get('reviewee', getattr(self.instance, 'reviewee', None))
        if self.instance:
            for field in ('rental', 'reviewer', 'reviewee'):
                if field in attrs and attrs[field].pk != getattr(self.instance, f'{field}_id'):
                    raise serializers.ValidationError({field: 'Este vínculo não pode ser alterado.'})
        if user and reviewer and reviewer.pk != user.pk:
            raise serializers.ValidationError({'reviewer': 'Você só pode avaliar em seu próprio nome.'})
        if rental and reviewer and reviewee:
            if rental.status != 'completed':
                raise serializers.ValidationError({'rental': 'A avaliação fica disponível após a conclusão da locação.'})
            parties = {rental.lessee_id, rental.postings.machinery.owner_id}
            if reviewer.pk not in parties or reviewee.pk not in parties or reviewer.pk == reviewee.pk:
                raise serializers.ValidationError({'reviewee': 'Avalie a outra parte desta locação.'})
        return attrs


class ReviewFilterSerializer(serializers.Serializer[Any]):
    """Query params aceitos na listagem de avaliações."""

    reviewee = serializers.UUIDField(required=False, help_text="ID do usuário avaliado.")
    reviewer = serializers.UUIDField(required=False, help_text="ID do usuário que avaliou.")
    rental = serializers.UUIDField(required=False, help_text="ID da locação.")


class ReviewOutputSerializer(serializers.ModelSerializer[Reviews]):
    reviewer_name = serializers.CharField(source="reviewer.name", read_only=True)
    reviewee_name = serializers.CharField(source="reviewee.name", read_only=True)
    criterio_nome = serializers.CharField(source="criterio.nome", read_only=True, allow_null=True)

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
            "criterio",
            "criterio_nome",
        ]
        read_only_fields = fields


class CriterioAvaliacaoOutputSerializer(serializers.ModelSerializer[CriterioAvaliacao]):
    class Meta:
        model = CriterioAvaliacao
        fields = ["id", "nome"]
        read_only_fields = fields
