from typing import Any

from rest_framework import serializers

from document_validation.enums import ReviewDecision, ValidationStatus
from document_validation.models import AreaCertificacao, Certification, OperatorLicense, TipoVinculo
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
            "tipo_vinculo",
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
            "area",
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
    tipo_vinculo_nome = serializers.CharField(source="tipo_vinculo.nome", read_only=True, allow_null=True)

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
            "auto_rejected",
            "veracity_score",
            "auto_rejection_reasons",
            "created_at",
            "updated_at",
            "tipo_vinculo",
            "tipo_vinculo_nome",
        ]
        read_only_fields = fields


class CertificationOutputSerializer(serializers.ModelSerializer[Certification]):
    area_nome = serializers.CharField(source="area.nome", read_only=True, allow_null=True)

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
            "area",
            "area_nome",
        ]
        read_only_fields = fields


class DocumentUrlOutputSerializer(serializers.Serializer[Any]):
    """Endereço do arquivo persistido no servidor."""

    url = serializers.CharField(
        help_text="Caminho público do arquivo salvo, relativo ao MEDIA_URL."
    )


class CnhValidationOutputSerializer(serializers.Serializer[Any]):
    """Resultado do modelo de imagem: reconhece a CNH e, se conseguir, lê os campos (OCR)."""

    # O metaclass do DRF remove os campos declarados dos atributos da classe: este
    # campo não sobrescreve o método `is_valid()` em runtime, só na visão do mypy.
    is_valid = serializers.BooleanField(  # type: ignore[assignment]
        help_text=(
            "`true` quando a rede neural reconhece o arquivo como uma CNH (score >= 0.5) **ou** "
            "quando o OCR encontra o layout de uma CNH e campos suficientes e válidos."
        )
    )
    confidence = serializers.ChoiceField(
        choices=[("high", "Alta"), ("medium", "Média"), ("low", "Baixa")],
        help_text=(
            "Faixa de confiança da rede neural: `high` (>= 0.85), `medium` (>= 0.5) ou `low`. "
            "Fica `medium` quando só o OCR aprovou o documento."
        ),
    )
    score = serializers.FloatField(
        help_text="Probabilidade de o documento ser uma CNH segundo a rede neural, de 0 a 1."
    )
    document_type = serializers.ChoiceField(
        choices=[
            ("cnh_antiga", "CNH física antiga (aberta)"),
            ("cnh_digital", "CNH digital (layout numerado)"),
            ("desconhecido", "Layout não reconhecido pelo OCR"),
        ],
        required=False,
        help_text=(
            "Layout que o OCR reconheceu. `desconhecido` (CNH física nova, foto ruim, ou não é uma "
            "CNH) significa que só vale o `is_valid` da rede neural, sem campos."
        ),
    )
    # Mesmo caso do `is_valid`: o metaclass do DRF tira o campo da classe, então ele não sobrescreve
    # o atributo `Serializer.fields` em runtime, só na visão do mypy.
    fields = serializers.DictField(  # type: ignore[assignment]
        required=False,
        allow_null=True,
        help_text=(
            "Campos lidos por OCR e validados (CPF com dígitos verificadores, datas reais, UF, "
            "categoria...), com as mesmas chaves do `POST /operator-licenses` para o front "
            "preencher o formulário. Só traz o que foi possível ler; `null` se o OCR não funcionou."
        ),
    )
    uncertain_fields = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        help_text="Campos de `fields` lidos com pouca certeza (nome, RG): o usuário deve conferi-los.",
    )
    error = serializers.CharField(
        required=False,
        help_text="Presente apenas quando o classificador falhou ao processar o arquivo.",
    )


class AreaCertificacaoOutputSerializer(serializers.ModelSerializer[AreaCertificacao]):
    class Meta:
        model = AreaCertificacao
        fields = ["id", "nome"]
        read_only_fields = fields


class TipoVinculoOutputSerializer(serializers.ModelSerializer[TipoVinculo]):
    class Meta:
        model = TipoVinculo
        fields = ["id", "nome"]
        read_only_fields = fields
