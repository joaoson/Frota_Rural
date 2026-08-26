import uuid
from django.utils import timezone
from rest_framework import serializers
from .models import OperatorLicense, Certification

# Situação de validação registrada no documento, incluindo a inicial (`pending`).
VALIDATION_STATUS_CHOICES = OperatorLicense.ValidationStatus.choices

# Decisões possíveis na análise manual de um documento. Diferente de
# `VALIDATION_STATUS_CHOICES`, não inclui `pending`: o administrador sempre conclui a análise.
REVIEW_DECISION_CHOICES = [
    ('approved', 'Aprovado'),
    ('rejected', 'Rejeitado'),
]


class DocumentReviewSerializer(serializers.Serializer):
    """Corpo esperado na análise manual de uma CNH ou certificação."""

    validation_status = serializers.ChoiceField(
        choices=REVIEW_DECISION_CHOICES,
        help_text='Resultado da análise feita pelo administrador.',
    )
    review_note = serializers.CharField(
        required=False,
        allow_null=True,
        help_text='Justificativa da análise. Obrigatória quando `validation_status` é `rejected`.',
    )


class DocumentUrlSerializer(serializers.Serializer):
    """Endereço do arquivo persistido no servidor."""

    url = serializers.CharField(help_text='Caminho público do arquivo salvo, relativo ao MEDIA_URL.')


class CnhValidationResultSerializer(serializers.Serializer):
    """Resultado devolvido pelo classificador de CNH."""

    is_valid = serializers.BooleanField(
        help_text='`true` quando o modelo reconhece o arquivo como uma CNH (score >= 0.5).'
    )
    confidence = serializers.ChoiceField(
        choices=[('high', 'Alta'), ('medium', 'Média'), ('low', 'Baixa')],
        help_text='Faixa de confiança: `high` (>= 0.85), `medium` (>= 0.5) ou `low`.',
    )
    score = serializers.FloatField(help_text='Probabilidade de o documento ser uma CNH, de 0 a 1.')
    error = serializers.CharField(
        required=False,
        help_text='Presente apenas quando o classificador falhou ao processar o arquivo.',
    )


class OperatorLicenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = OperatorLicense
        fields = [
            "id",
            "user",
            "name",
            "birth_date",
            "cpf",
            "rg",
            "mother_name",
            "father_name",
            "nationality",
            "birth_place",
            "cnh_number",
            "category",
            "first_license_date",
            "issue_date",
            "expiration_date",
            "issuing_state",
            "issuing_authority",
            "situation",
            "acc",
            "ear",
            "medical_restrictions",
            "observations",
            "points",
            "file_url",
            "validation_status",
            "review_note",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def create(self, validated_data):
        now = timezone.now()
        validated_data.setdefault("validation_status", "pending")
        return OperatorLicense.objects.create(
            id=uuid.uuid4(),
            created_at=now,
            updated_at=now,
            **validated_data,
        )

    def update(self, instance, validated_data):
        validated_data["updated_at"] = timezone.now()
        validated_data["validation_status"] = "pending"
        validated_data["review_note"] = None
        return super().update(instance, validated_data)


class CertificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Certification
        fields = [
            "id",
            "user",
            "issuing_organization",
            "title",
            "issue_date",
            "expiration_date",
            "credential_code",
            "description",
            "media_url",
            "validation_status",
            "review_note",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def create(self, validated_data):
        now = timezone.now()
        validated_data.setdefault("validation_status", "pending")
        return Certification.objects.create(
            id=uuid.uuid4(),
            created_at=now,
            updated_at=now,
            **validated_data,
        )

    def update(self, instance, validated_data):
        validated_data["updated_at"] = timezone.now()
        validated_data["validation_status"] = "pending"
        validated_data["review_note"] = None
        return super().update(instance, validated_data)
