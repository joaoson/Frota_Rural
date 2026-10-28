from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from contracts.enums import ContractStatus, SignatureRole
from contracts.models import Contracts, ContractSignatures
from rentals.serializer import RentalOutputSerializer

# --- Entrada ----------------------------------------------------------------


class ContractOtpRequestInputSerializer(serializers.Serializer[Any]):
    """Pedido do código de uso único enviado por e-mail antes do aceite."""

    role = serializers.ChoiceField(
        choices=SignatureRole.choices, help_text="Parte que vai assinar."
    )
    revision_id = serializers.UUIDField(
        required=False,
        allow_null=True,
        help_text="`revisao.id` do documento que a parte leu. Obrigatório quando há revisão congelada; o código só vale para essa revisão. Ausência ou divergência retorna stale_revision (409).",
    )


class ContractSignInputSerializer(serializers.Serializer[Any]):
    """Aceite de uma das partes no contrato de locação."""

    role = serializers.ChoiceField(
        choices=SignatureRole.choices, help_text="Parte que está assinando."
    )
    name = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        max_length=255,
        help_text='Identificação de quem assinou, ex.: "João da Silva - CPF 123.456.789-00".',
    )
    otp = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text=(
            "Código de 6 dígitos enviado por e-mail. Obrigatório quando "
            "`CONTRACT_SIGNATURE_REQUIRE_OTP` está ligado."
        ),
    )
    revision_id = serializers.UUIDField(
        required=False,
        allow_null=True,
        help_text=(
            "`revisao.id` do documento que a parte leu. Obrigatório quando o contrato tem "
            "revisão congelada; se ela mudou, o aceite é recusado com `stale_revision`."
        ),
    )


# --- Saída: recursos ----------------------------------------------------------


class ContractOutputSerializer(serializers.ModelSerializer[Contracts]):
    rental_details = RentalOutputSerializer(source="rental", read_only=True)

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
        read_only_fields = fields


class ContractSignatureOutputSerializer(serializers.ModelSerializer[ContractSignatures]):
    """Evidência do aceite, no formato em que ela é exibida e auditada."""

    class Meta:
        model = ContractSignatures
        fields = [
            "id",
            "contract",
            "role",
            "revision",
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


class ContractSignOutputSerializer(ContractOutputSerializer):
    """Contrato após o aceite, com a evidência que acabou de ser gravada.

    A evidência chega pelo contexto (`context={"signature": ...}`), porque ela
    não é um atributo do contrato e sim o resultado da operação.
    """

    signature_evidence = serializers.SerializerMethodField()

    class Meta(ContractOutputSerializer.Meta):
        fields = [*ContractOutputSerializer.Meta.fields, "signature_evidence"]
        read_only_fields = fields

    @extend_schema_field(ContractSignatureOutputSerializer)
    def get_signature_evidence(self, obj: Contracts) -> dict[str, Any]:
        data: dict[str, Any] = ContractSignatureOutputSerializer(self.context["signature"]).data
        return data


class ContractOtpOutputSerializer(serializers.Serializer[Any]):
    sent_to = serializers.CharField(
        help_text="E-mail da parte, mascarado, para ela saber onde procurar o código."
    )
    expires_in_seconds = serializers.IntegerField()


# --- Saída: documento do contrato ---------------------------------------------
#
# Os campos abaixo precisam acompanhar `contracts.contract_document`: o
# serializer só devolve o que declara, e o front renderiza o PDF a partir deles.


class _ContractTermsSerializer(serializers.Serializer[Any]):
    numero = serializers.CharField()
    versao_documento = serializers.CharField()
    data_geracao = serializers.CharField()
    data_inicio = serializers.CharField()
    data_fim = serializers.CharField()
    prazo_dias = serializers.IntegerField()
    valor_unitario = serializers.CharField(help_text="Tarifa por hora congelada na reserva.")
    valor_locacao = serializers.CharField()
    valor_taxa_plataforma = serializers.CharField()
    percentual_taxa_plataforma = serializers.CharField()
    # Documento 2.0.0: preço por diária fixa (ADR 0002).
    horas_por_diaria = serializers.IntegerField(required=False)
    valor_diaria = serializers.CharField(required=False)
    diarias = serializers.IntegerField(required=False)
    valor_total = serializers.CharField(required=False)
    # Documento legado 1.0.0.
    estimativa_horas = serializers.IntegerField(required=False)
    valor_total_estimado = serializers.CharField(required=False)


class _ContractOperationSerializer(serializers.Serializer[Any]):
    codigo = serializers.CharField()


class _ContractPartySerializer(serializers.Serializer[Any]):
    razao_social = serializers.CharField()
    tipo_documento = serializers.CharField(
        help_text="`CPF` ou `CNPJ`, inferido pela quantidade de dígitos; vazio se não reconhecido."
    )
    documento = serializers.CharField()
    endereco_completo = serializers.CharField()
    representante_nome = serializers.CharField()
    representante_cpf = serializers.CharField()
    representante_estado_civil = serializers.CharField()


class _ContractLessorSerializer(_ContractPartySerializer):
    endereco_equipamento = serializers.CharField()


class _ContractLesseeSerializer(_ContractPartySerializer):
    municipio = serializers.CharField()
    uf = serializers.CharField()
    local_servico = serializers.CharField()


class _ContractEquipmentSerializer(serializers.Serializer[Any]):
    tipo = serializers.CharField()
    marca = serializers.CharField()
    modelo = serializers.CharField()
    ano = serializers.IntegerField(allow_null=True)
    renagro = serializers.CharField()
    valor_estimado = serializers.CharField()


class _ContractPostingSerializer(serializers.Serializer[Any]):
    tipo_servico = serializers.CharField()
    finalidade_uso = serializers.CharField()


class _ContractSignatureDatesSerializer(serializers.Serializer[Any]):
    data_locador = serializers.CharField(help_text="Data do aceite, ou `—` se ainda não assinou.")
    data_locatario = serializers.CharField(help_text="Data do aceite, ou `—` se ainda não assinou.")


class _SignatureSummarySerializer(serializers.Serializer[Any]):
    papel = serializers.ChoiceField(choices=SignatureRole.choices)
    nome = serializers.CharField()
    email = serializers.CharField()
    assinado_em_utc = serializers.CharField()
    hash_documento = serializers.CharField()
    algoritmo_hash = serializers.CharField()
    versao_documento = serializers.CharField()
    ip = serializers.CharField()
    otp_verificado = serializers.BooleanField()
    hash_registro = serializers.CharField()


class _RevisionSummarySerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField(help_text="Informe em `revision_id` ao pedir o código e ao assinar.")
    numero = serializers.IntegerField()
    hash = serializers.CharField()
    criada_em_utc = serializers.CharField()


class _DocumentEvidenceSerializer(serializers.Serializer[Any]):
    hash_documento_atual = serializers.CharField()
    algoritmo_hash = serializers.CharField()
    assinaturas = _SignatureSummarySerializer(many=True)


class _ContractManagementSerializer(serializers.Serializer[Any]):
    allowed_actions = serializers.ListField(child=serializers.CharField())
    start_date = serializers.DateTimeField()
    end_date = serializers.DateTimeField()


class ContractDocumentOutputSerializer(serializers.Serializer[Any]):
    """Payload agregado e já formatado para renderizar o PDF do contrato."""

    titulo = serializers.CharField(required=False)
    contrato = _ContractTermsSerializer()
    operacao = _ContractOperationSerializer()
    locador = _ContractLessorSerializer()
    locatario = _ContractLesseeSerializer()
    equipamento = _ContractEquipmentSerializer()
    anuncio = _ContractPostingSerializer()
    preambulo = serializers.CharField(required=False)
    clausulas = serializers.JSONField(
        required=False, help_text="Texto completo das cláusulas (documento 2.0.0), coberto pelo hash."
    )
    declaracao_assinatura = serializers.CharField(required=False)
    revisao = _RevisionSummarySerializer(allow_null=True)
    prazo_assinatura = serializers.DateTimeField(allow_null=True)
    gestao = _ContractManagementSerializer()
    legado = serializers.BooleanField(help_text="Aceite gravado antes das revisões (documento 1.0.0).")
    previa = serializers.BooleanField(help_text="Contrato ainda não pago: o texto congela no pagamento.")
    assinatura = _ContractSignatureDatesSerializer()
    evidencia = _DocumentEvidenceSerializer()


class _EvidenceDocumentSerializer(serializers.Serializer[Any]):
    versao = serializers.CharField()
    hash = serializers.CharField()
    algoritmo = serializers.CharField()
    revisao = serializers.IntegerField(allow_null=True)


class ContractEvidenceOutputSerializer(serializers.Serializer[Any]):
    """Trilha de auditoria completa do aceite eletrônico."""

    contrato_id = serializers.UUIDField()
    aluguel_id = serializers.UUIDField()
    status = serializers.ChoiceField(choices=ContractStatus.choices, allow_null=True)
    documento = _EvidenceDocumentSerializer()
    cadeia_integra = serializers.BooleanField()
    inconsistencias = serializers.ListField(child=serializers.CharField())
    assinaturas = ContractSignatureOutputSerializer(many=True)
    fundamento_legal = serializers.CharField()
