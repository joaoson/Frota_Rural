"""Formato único de erro da API.

Toda resposta de erro sai como:

    {
        "code": "validation_error",          # estável, legível por máquina
        "message": "Dados inválidos.",       # texto em PT-BR para exibição
        "errors": {"email": ["..."]}         # só preenchido em erro de validação
    }

É o mesmo vocabulário (`code` + `message`) do evento de erro do WebSocket do
chat, para o cliente tratar as duas rotas do mesmo jeito.
"""

from typing import Any

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import exceptions
from rest_framework.response import Response
from rest_framework.settings import api_settings
from rest_framework.views import exception_handler

VALIDATION_ERROR_CODE = "validation_error"
VALIDATION_ERROR_MESSAGE = "Dados inválidos."

# As mensagens padrão do DRF e do SimpleJWT chegam em inglês. Quando a exceção
# foi levantada sem mensagem própria, o cliente recebe a versão abaixo.
DEFAULT_MESSAGES: dict[str, str] = {
    "not_authenticated": "Autenticação necessária.",
    "authentication_failed": "Credenciais inválidas.",
    "token_not_valid": "Token inválido ou expirado.",
    "user_not_found": "Usuário não encontrado.",
    "user_inactive": "Conta desativada.",
    "permission_denied": "Você não tem permissão para executar esta ação.",
    "not_found": "Recurso não encontrado.",
    "method_not_allowed": "Método não permitido.",
    "not_acceptable": "Formato de resposta não suportado.",
    "parse_error": "Corpo da requisição malformado.",
    "unsupported_media_type": "Tipo de conteúdo não suportado.",
    "throttled": "Muitas requisições. Tente novamente em instantes.",
}


def api_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    """`EXCEPTION_HANDLER` do DRF: delega ao handler padrão e reescreve o corpo."""
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied()

    # O handler padrão cuida de status, headers (WWW-Authenticate, Retry-After)
    # e do rollback da transação; aqui só o corpo muda.
    response = exception_handler(exc, context)
    if response is None or not isinstance(exc, exceptions.APIException):
        return response

    response.data = build_error_body(exc)
    return response


def build_error_body(exc: exceptions.APIException) -> dict[str, Any]:
    if isinstance(exc, exceptions.ValidationError):
        errors = normalize_errors(exc.detail)
        non_field = errors.get(api_settings.NON_FIELD_ERRORS_KEY, [])
        return {
            "code": VALIDATION_ERROR_CODE,
            # Erro sem campo (ex.: regra de negócio) é a melhor mensagem geral.
            "message": non_field[0] if non_field else VALIDATION_ERROR_MESSAGE,
            "errors": errors,
        }

    code, message = _code_and_message(exc)
    # Detail em dict só vem do SimpleJWT, sempre com mensagem em inglês.
    if message == str(exc.default_detail) or isinstance(exc.detail, dict):
        message = DEFAULT_MESSAGES.get(code, message)
    return {"code": code, "message": message, "errors": {}}


def normalize_errors(detail: object, field: str = "") -> dict[str, list[str]]:
    """Achata o `detail` do DRF em `{campo: [mensagens]}`.

    Serializers aninhados viram chaves pontuadas (`contrato.data_inicio`,
    `photos.0.url`) e erros sem campo vão para `non_field_errors`, mesmo quando
    chegam como string solta em vez de lista.
    """
    errors: dict[str, list[str]] = {}

    def add(key: str, messages: dict[str, list[str]] | list[str]) -> None:
        if isinstance(messages, dict):
            for nested_key, nested_messages in messages.items():
                errors.setdefault(nested_key, []).extend(nested_messages)
        else:
            errors.setdefault(key, []).extend(messages)

    key = field or api_settings.NON_FIELD_ERRORS_KEY
    if isinstance(detail, dict):
        for name, value in detail.items():
            nested = str(name) if not field else f"{field}.{name}"
            if not field and name == api_settings.NON_FIELD_ERRORS_KEY:
                nested = api_settings.NON_FIELD_ERRORS_KEY
            add(nested, normalize_errors(value, nested))
    elif isinstance(detail, list):
        for index, item in enumerate(detail):
            if isinstance(item, dict | list):
                add(key, normalize_errors(item, f"{key}.{index}"))
            else:
                add(key, [str(item)])
    else:
        add(key, [str(detail)])
    return errors


def _code_and_message(exc: exceptions.APIException) -> tuple[str, str]:
    detail: Any = exc.detail
    default_code = str(exc.default_code)

    # O SimpleJWT usa um dict como detail: {"detail", "code", "messages"}.
    if isinstance(detail, dict):
        return (
            str(detail.get("code", default_code)),
            str(detail.get("detail", exc.default_detail)),
        )
    if isinstance(detail, list):
        first = detail[0] if detail else exc.default_detail
        return str(getattr(first, "code", default_code)), str(first)
    return str(getattr(detail, "code", None) or default_code), str(detail)
