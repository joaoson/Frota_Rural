"""Serializers e respostas reutilizados na documentação OpenAPI de todos os apps."""

from typing import Any

from drf_spectacular.utils import OpenApiResponse
from rest_framework import serializers


class ErrorResponseSerializer(serializers.Serializer[Any]):
    """Corpo único de erro da API (ver `common.exception_handler`)."""

    code = serializers.CharField(
        help_text="Código estável, legível por máquina (ex.: `validation_error`, `not_found`)."
    )
    message = serializers.CharField(help_text="Descrição do erro em PT-BR, pronta para exibição.")
    errors = serializers.DictField(
        child=serializers.ListField(child=serializers.CharField()),
        help_text=(
            "Mensagens por campo. Vazio fora de erro de validação; erros sem campo "
            "ficam em `non_field_errors`."
        ),
    )


class MessageResponseSerializer(serializers.Serializer[Any]):
    """Resposta de sucesso sem corpo de recurso."""

    message = serializers.CharField(help_text="Descrição legível do resultado da operação.")


DEFAULT_ERROR_DESCRIPTIONS: dict[int, str] = {
    400: "Dados inválidos.",
    401: "Autenticação ausente ou inválida.",
    403: "Sem permissão para executar a ação.",
    404: "Recurso não encontrado.",
    409: "Conflito com o estado atual do recurso.",
    429: "Muitas requisições em pouco tempo.",
    502: "Falha na comunicação com um serviço externo.",
    503: "Serviço temporariamente indisponível.",
}


def error_response(status_code: int, description: str | None = None) -> OpenApiResponse:
    """Uma resposta de erro documentada com o corpo padrão."""
    return OpenApiResponse(
        response=ErrorResponseSerializer,
        description=description or DEFAULT_ERROR_DESCRIPTIONS.get(status_code, "Erro."),
    )


def error_responses(*status_codes: int) -> dict[int, OpenApiResponse]:
    """Atalho para `responses={200: X, **error_responses(400, 404)}`."""
    return {status_code: error_response(status_code) for status_code in status_codes}
