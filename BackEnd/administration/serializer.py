from rest_framework import serializers


class PostingRejectionSerializer(serializers.Serializer):
    """Corpo esperado na reprovação de um anúncio."""

    reason = serializers.CharField(
        help_text='Motivo da reprovação, apresentado ao locador e gravado no histórico de moderação.'
    )


class MessageModerationDecisionSerializer(serializers.Serializer):
    """Decisão do moderador sobre uma mensagem denunciada ou auto-sinalizada."""

    decision = serializers.ChoiceField(choices=['dismiss', 'hide'])
    note = serializers.CharField(max_length=1000, required=False, allow_blank=True)
