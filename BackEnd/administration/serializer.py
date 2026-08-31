from rest_framework import serializers


class PostingRejectionSerializer(serializers.Serializer):
    """Corpo esperado na reprovação de um anúncio."""

    reason = serializers.CharField(
        help_text='Motivo da reprovação, apresentado ao locador e gravado no histórico de moderação.'
    )
