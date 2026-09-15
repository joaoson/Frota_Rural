"""Exceções HTTP que o DRF não traz prontas.

Os services levantam as exceções do próprio DRF (`NotFound`, `ValidationError`,
`PermissionDenied`, `AuthenticationFailed`...) e as três abaixo. O
`api_exception_handler` converte todas para o mesmo corpo
`{"code", "message", "errors"}`.

Um código mais específico que o padrão vai no construtor:
`Conflict("Esta parte já assinou o contrato.", code="already_signed")`.
"""

from rest_framework import status
from rest_framework.exceptions import APIException


class Unauthorized(APIException):
    """401 que o DRF não converte em 403.

    Para `NotAuthenticated`/`AuthenticationFailed` o DRF troca o status para 403
    quando o primeiro autenticador da view não emite `WWW-Authenticate` (caso
    do `SessionAuthentication`). Login e refresh precisam do 401 de verdade: é
    ele que o cliente usa para distinguir "sessão expirada" de "sem permissão".
    """

    status_code = status.HTTP_401_UNAUTHORIZED
    default_detail = "Autenticação necessária."
    default_code = "not_authenticated"


class Conflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "O recurso está em conflito com o estado atual."
    default_code = "conflict"


class BadGateway(APIException):
    status_code = status.HTTP_502_BAD_GATEWAY
    default_detail = "Falha na comunicação com um serviço externo."
    default_code = "external_service_error"


class ServiceUnavailable(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "Serviço temporariamente indisponível."
    default_code = "service_unavailable"
