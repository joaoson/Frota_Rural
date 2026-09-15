from typing import Any

from rest_framework import serializers

from administration.enums import ModerationQueueSource, ModerationQueueStatus
from chat.enums import ModerationDecision, ReportResolution
from chat.serializer import ChatUserOutputSerializer

# --- Entrada ----------------------------------------------------------------


class PostingRejectionInputSerializer(serializers.Serializer[Any]):
    """Corpo esperado na reprovação de um anúncio."""

    reason = serializers.CharField(
        trim_whitespace=True,
        error_messages={
            "required": "Informe o motivo da reprovação.",
            "blank": "Informe o motivo da reprovação.",
        },
        help_text="Motivo da reprovação, apresentado ao locador e gravado no histórico de moderação.",
    )


class MessageModerationDecisionInputSerializer(serializers.Serializer[Any]):
    """Decisão do moderador sobre uma mensagem denunciada ou auto-sinalizada."""

    decision = serializers.ChoiceField(choices=ModerationDecision.choices)
    note = serializers.CharField(max_length=1000, required=False, allow_blank=True, allow_null=True)


class ChatModerationFilterSerializer(serializers.Serializer[Any]):
    status = serializers.ChoiceField(
        choices=ModerationQueueStatus.choices,
        required=False,
        default=ModerationQueueStatus.PENDING,
    )
    # O metaclass do DRF remove os campos declarados dos atributos da classe: este
    # campo não sobrescreve `Field.source` em runtime, só na visão do mypy.
    source = serializers.ChoiceField(  # type: ignore[assignment]
        choices=ModerationQueueSource.choices,
        required=False,
        default=ModerationQueueSource.ALL,
    )
    limit = serializers.IntegerField(required=False, default=25, min_value=1, max_value=100)
    offset = serializers.IntegerField(required=False, default=0, min_value=0)


# --- Saída ------------------------------------------------------------------


class ModerationReportOutputSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    reason = serializers.CharField()
    reported_by = ChatUserOutputSerializer(allow_null=True)
    created_at = serializers.DateTimeField()
    resolution = serializers.ChoiceField(choices=ReportResolution.choices, allow_null=True)
    resolved_at = serializers.DateTimeField(allow_null=True)
    resolved_by = ChatUserOutputSerializer(allow_null=True)


class ModerationQueueItemOutputSerializer(serializers.Serializer[Any]):
    message_id = serializers.UUIDField()
    thread_id = serializers.CharField()
    content = serializers.CharField(allow_null=True)
    sent_at = serializers.DateTimeField()
    hidden = serializers.BooleanField()
    sender = ChatUserOutputSerializer(allow_null=True)
    receiver = ChatUserOutputSerializer(allow_null=True)
    # O metaclass do DRF remove os campos declarados dos atributos da classe: este
    # campo não sobrescreve `Field.source` em runtime, só na visão do mypy.
    source = serializers.ChoiceField(  # type: ignore[assignment]
        choices=[
            (ModerationQueueSource.REPORT.value, ModerationQueueSource.REPORT.label),
            (ModerationQueueSource.AUTO.value, ModerationQueueSource.AUTO.label),
        ]
    )
    reports = ModerationReportOutputSerializer(many=True)


class ModerationQueuePageOutputSerializer(serializers.Serializer[Any]):
    count = serializers.IntegerField()
    limit = serializers.IntegerField()
    offset = serializers.IntegerField()
    results = ModerationQueueItemOutputSerializer(many=True)
