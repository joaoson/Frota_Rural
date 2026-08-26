"""Serializers usados apenas para documentar respostas genéricas da API.

Vários endpoints respondem com um objeto simples (`{"message": ...}` ou
`{"error": ...}`) que não corresponde a nenhum model. Sem estes serializers o
drf-spectacular gera a resposta sem schema e o Swagger UI mostra um corpo vazio.
"""

from rest_framework import serializers


class MessageResponseSerializer(serializers.Serializer):
    """Resposta de sucesso sem corpo de recurso."""

    message = serializers.CharField(help_text='Descrição legível do resultado da operação.')


class ErrorResponseSerializer(serializers.Serializer):
    """Resposta de erro tratado pela regra de negócio."""

    error = serializers.CharField(help_text='Descrição legível do motivo da falha.')


SIGNATURE_ROLE_CHOICES = [
    ('locador', 'Locador (dono do maquinário)'),
    ('locatario', 'Locatário (produtor que aluga)'),
]


class ContractSignatureSerializer(serializers.Serializer):
    """Aceite de uma das partes no contrato de locação."""

    role = serializers.ChoiceField(
        choices=SIGNATURE_ROLE_CHOICES,
        help_text='Parte que está assinando. Qualquer valor diferente de `locatario` é tratado como locador.',
    )
    name = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text='Identificação de quem assinou, ex.: "João da Silva - CPF 123.456.789-00".',
    )


class _ContractDocumentDataSerializer(serializers.Serializer):
    numero = serializers.CharField()
    data_geracao = serializers.CharField()
    data_inicio = serializers.CharField()
    data_fim = serializers.CharField()
    prazo_dias = serializers.IntegerField()
    valor_unitario = serializers.CharField()
    estimativa_horas = serializers.IntegerField()
    valor_total_estimado = serializers.CharField()


class _ContractPartySerializer(serializers.Serializer):
    razao_social = serializers.CharField()
    tipo_documento = serializers.CharField(help_text='`CPF` ou `CNPJ`, inferido pelo tamanho do documento.')
    documento = serializers.CharField()
    endereco_completo = serializers.CharField()
    representante_nome = serializers.CharField()
    representante_cpf = serializers.CharField()
    representante_estado_civil = serializers.CharField()


class _ContractEquipmentSerializer(serializers.Serializer):
    tipo = serializers.CharField()
    marca = serializers.CharField()
    modelo = serializers.CharField()
    ano = serializers.IntegerField()
    renagro = serializers.CharField()
    valor_estimado = serializers.CharField()


class ContractDocumentSerializer(serializers.Serializer):
    """Payload agregado e já formatado para renderizar o PDF do contrato."""

    contrato = _ContractDocumentDataSerializer()
    operacao = serializers.DictField(child=serializers.CharField())
    locador = _ContractPartySerializer()
    locatario = _ContractPartySerializer()
    equipamento = _ContractEquipmentSerializer()
    anuncio = serializers.DictField(child=serializers.CharField())
    assinatura = serializers.DictField(
        child=serializers.CharField(),
        help_text='Data em que cada parte assinou, ou `—` quando a assinatura ainda não ocorreu.',
    )
