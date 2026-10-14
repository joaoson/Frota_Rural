from typing import Any

from rest_framework import serializers

from document_validation.enums import ReviewDecision, ValidationStatus
from document_validation.models import Certification, OperatorLicense
from users.models import Users

# --- Entrada ----------------------------------------------------------------


class OwnedDocumentInputSerializer(serializers.ModelSerializer[Any]):
    def validate_user(self, value: Users) -> Users:
        actor = self.context.get("actor")
        if self.instance and self.instance.user_id != value.pk:
            raise serializers.ValidationError("O dono do documento não pode ser alterado.")
        if actor is not None and value.pk != actor.pk:
            raise serializers.ValidationError("Cadastre documentos apenas na sua própria conta.")
        return value


class OperatorLicenseInputSerializer(OwnedDocumentInputSerializer):
    """Dados da CNH enviados pelo operador.

    `validation_status` e `review_note` não entram: só a análise do
    administrador muda esses campos.
    """

    class Meta:
        model = OperatorLicense
        fields = [
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
        ]


class CertificationInputSerializer(OwnedDocumentInputSerializer):
    """Dados da certificação enviados pelo usuário (sem os campos de análise)."""

    class Meta:
        model = Certification
        fields = [
            "user",
            "issuing_organization",
            "title",
            "issue_date",
            "expiration_date",
            "credential_code",
            "description",
            "media_url",
        ]


class DocumentFilterSerializer(serializers.Serializer[Any]):
    """Query params aceitos nas listagens de CNHs e certificações."""

    user = serializers.UUIDField(required=False, help_text="ID do usuário dono do documento.")
    validation_status = serializers.ChoiceField(
        choices=ValidationStatus.choices,
        required=False,
        help_text="Resultado da análise do documento.",
    )


class DocumentReviewInputSerializer(serializers.Serializer[Any]):
    """Análise manual de uma CNH ou certificação."""

    validation_status = serializers.ChoiceField(
        choices=ReviewDecision.choices,
        help_text="Resultado da análise feita pelo administrador.",
    )
    review_note = serializers.CharField(
        required=False,
        allow_null=True,
        allow_blank=True,
        help_text="Justificativa da análise. Obrigatória quando `validation_status` é `rejected`.",
    )

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs["validation_status"] == ReviewDecision.REJECTED and not attrs.get("review_note"):
            raise serializers.ValidationError(
                {"review_note": "O motivo da rejeição é obrigatório."}
            )
        return attrs


# --- Saída ------------------------------------------------------------------


class OperatorLicenseOutputSerializer(serializers.ModelSerializer[OperatorLicense]):
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
        read_only_fields = fields


class CertificationOutputSerializer(serializers.ModelSerializer[Certification]):
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
        read_only_fields = fields


class DocumentUrlOutputSerializer(serializers.Serializer[Any]):
    """Endereço do arquivo persistido no servidor."""

    url = serializers.CharField(
        help_text="Caminho público do arquivo salvo, relativo ao MEDIA_URL."
    )


class CnhValidationOutputSerializer(serializers.Serializer[Any]):
    """Resultado devolvido pelo classificador de CNH."""

    # O metaclass do DRF remove os campos declarados dos atributos da classe: este
    # campo não sobrescreve o método `is_valid()` em runtime, só na visão do mypy.
    is_valid = serializers.BooleanField(  # type: ignore[assignment]
        help_text="`true` quando o modelo reconhece o arquivo como uma CNH (score >= 0.5)."
    )
    confidence = serializers.ChoiceField(
        choices=[("high", "Alta"), ("medium", "Média"), ("low", "Baixa")],
        help_text="Faixa de confiança: `high` (>= 0.85), `medium` (>= 0.5) ou `low`.",
    )
    score = serializers.FloatField(help_text="Probabilidade de o documento ser uma CNH, de 0 a 1.")
    error = serializers.CharField(
        required=False,
        help_text="Presente apenas quando o classificador falhou ao processar o arquivo.",
    )
