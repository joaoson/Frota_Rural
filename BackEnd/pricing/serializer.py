from rest_framework import serializers


class SuggestionRequestSerializer(serializers.Serializer):
    machinery = serializers.UUIDField(
        help_text="ID da máquina para a qual sugerir o valor/hora."
    )
    includes_fuel = serializers.BooleanField(
        required=False, default=False,
        help_text="O anúncio inclui o diesel? Muda bastante a tarifa.",
    )
    includes_operator = serializers.BooleanField(
        required=False, default=False,
        help_text="O anúncio inclui o operador?",
    )


class BreakdownItemSerializer(serializers.Serializer):
    chave = serializers.CharField()
    item = serializers.CharField()
    brl_hora = serializers.CharField()


class SuggestionResponseSerializer(serializers.Serializer):
    suggestion_id = serializers.UUIDField()
    sugerido_brl_hora = serializers.DecimalField(max_digits=10, decimal_places=2)
    faixa_brl_hora = serializers.ListField(child=serializers.DecimalField(max_digits=10, decimal_places=2))
    custo_brl_hora = serializers.DecimalField(max_digits=10, decimal_places=2)
    locatario_paga_brl_hora = serializers.DecimalField(max_digits=10, decimal_places=2)
    equivalente_diaria_brl = serializers.DecimalField(max_digits=10, decimal_places=2)
    composicao = BreakdownItemSerializer(many=True)
    premissas = serializers.DictField()
    fontes = serializers.ListField(child=serializers.DictField())
    search_suggestions_html = serializers.CharField(required=False, allow_null=True)
    confianca = serializers.CharField()
    origem = serializers.CharField()
    versao_parametros = serializers.CharField()


class SuggestionUnavailableSerializer(serializers.Serializer):
    error = serializers.CharField()
