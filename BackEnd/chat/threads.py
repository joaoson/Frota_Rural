"""Chave de thread e regras de autorização do chat.

Não existe tabela `conversations`. Uma thread é derivada da própria linha de
`messages`:

    thread_id := "<scope>:<scope_id>:<user_a>:<user_b>"

onde `user_a` e `user_b` são os dois participantes ordenados como string. A
ordenação precisa bater com a do SQL em `selectors.py`, que usa LEAST/GREATEST
direto nas colunas `uuid` — comparação byte a byte, igual à ordem
hexadecimal-lexicográfica do Python. Nunca fazer `::text` lá: viraria
dependente de collation e os dois lados passariam a discordar do thread_id.

Este módulo é a ÚNICA fonte de verdade de autorização — as views REST e o
ChatConsumer chamam as mesmas funções.
"""

import hashlib
import uuid
from typing import Final
from uuid import UUID

from rest_framework.exceptions import APIException

from chat.enums import ThreadScope
from postings.enums import PostingStatus
from postings.models import Postings
from rentals.enums import RentalStatus
from rentals.models import Rentals
from users.enums import UserRole
from users.models import Users

SCOPE_RENTAL: Final = ThreadScope.RENTAL.value
SCOPE_POSTING: Final = ThreadScope.POSTING.value
VALID_SCOPES: Final = (SCOPE_RENTAL, SCOPE_POSTING)

type ScopeObject = Rentals | Postings

INVALID_THREAD = "Identificador de conversa inválido."
NOT_A_PARTICIPANT = "Você não participa desta conversa."
CANNOT_WRITE = "Você não pode enviar mensagens nesta conversa."

# O mesmo `code` sai no corpo de erro REST e no evento `error` do WebSocket.
CODE_FOR_STATUS: Final = {
    400: "invalid_thread",
    403: "forbidden",
    404: "not_found",
    409: "conflict",
    429: "rate_limited",
}


class ThreadError(APIException):
    """Erro de negócio do chat, com mensagem pronta para o cliente (em português)."""

    status_code = 400
    default_detail = INVALID_THREAD
    default_code = "invalid_thread"

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message, code=CODE_FOR_STATUS.get(status, self.default_code))
        self.status_code = status
        self.message = message

    @property
    def code(self) -> str:
        return CODE_FOR_STATUS.get(self.status_code, self.default_code)


def format_thread_id(
    scope: str, scope_id: UUID | str, user_a: UUID | str, user_b: UUID | str
) -> str:
    if scope not in VALID_SCOPES:
        raise ThreadError(INVALID_THREAD)
    lo, hi = sorted([str(user_a), str(user_b)])
    if lo == hi:
        raise ThreadError(INVALID_THREAD)
    return f"{scope}:{scope_id}:{lo}:{hi}"


def parse_thread_id(thread_id: str | None) -> tuple[str, UUID, UUID, UUID]:
    """-> (scope, scope_id, lo, hi). Levanta ThreadError."""
    parts = (thread_id or "").split(":")
    if len(parts) != 4:  # noqa: PLR2004 — escopo, id do escopo e os dois participantes
        raise ThreadError(INVALID_THREAD)
    scope, scope_id, lo, hi = parts
    if scope not in VALID_SCOPES:
        raise ThreadError(INVALID_THREAD)
    try:
        scope_uuid = uuid.UUID(scope_id)
        lo_uuid = uuid.UUID(lo)
        hi_uuid = uuid.UUID(hi)
    except (ValueError, AttributeError, TypeError) as exc:
        raise ThreadError(INVALID_THREAD) from exc
    if str(lo_uuid) == str(hi_uuid):
        raise ThreadError(INVALID_THREAD)
    # Recusa uma chave que não esteja na forma canônica: senão o mesmo par de
    # usuários geraria dois thread_ids diferentes e dois grupos de fan-out.
    if sorted([str(lo_uuid), str(hi_uuid)]) != [str(lo_uuid), str(hi_uuid)]:
        raise ThreadError(INVALID_THREAD)
    return scope, scope_uuid, lo_uuid, hi_uuid


def group_name(thread_id: str) -> str:
    """Nome do grupo no channel layer.

    Grupos do Channels aceitam só [a-zA-Z0-9._-] e ~100 chars; o thread_id tem
    dois-pontos e é longo demais, então vai hasheado.
    """
    return "chat." + hashlib.sha256(thread_id.encode()).hexdigest()[:32]


def user_group_name(user_id: UUID | str) -> str:
    return "chat.user." + uuid.UUID(str(user_id)).hex


# --------------------------------------------------------------------------
# Participantes
# --------------------------------------------------------------------------


def rental_participants(rental: Rentals) -> set[str]:
    """{lessee, dono do maquinário, operador (se houver)}."""
    ids = {str(rental.lessee_id)}
    owner_id = _rental_owner_id(rental)
    if owner_id:
        ids.add(str(owner_id))
    if rental.operator_id:
        ids.add(str(rental.operator_id))
    return ids


def _rental_owner_id(rental: Rentals) -> UUID | None:
    # getattr com default também cobre FK pendurada (DO_NOTHING), cujo acesso
    # levanta RelatedObjectDoesNotExist — que é um AttributeError.
    posting: Postings | None = getattr(rental, "postings", None)
    return posting_owner_id(posting) if posting else None


def posting_owner_id(posting: Postings) -> UUID | None:
    machinery = getattr(posting, "machinery", None)
    return machinery.owner_id if machinery else None


def load_scope(scope: str, scope_id: UUID) -> ScopeObject:
    """Carrega Rentals/Postings já com os joins que a autorização precisa."""
    if scope == SCOPE_RENTAL:
        try:
            return Rentals.objects.select_related("postings__machinery").get(id=scope_id)
        except Rentals.DoesNotExist as exc:
            raise ThreadError("Locação não encontrada.", status=404) from exc
    try:
        return Postings.objects.select_related("machinery").get(id=scope_id)
    except Postings.DoesNotExist as exc:
        raise ThreadError("Anúncio não encontrado.", status=404) from exc


def is_admin(user: Users) -> bool:
    return user.role == UserRole.ADMIN


def can_read(user: Users, scope: str, scope_obj: ScopeObject, participants: set[str]) -> bool:
    """participants = {str(lo), str(hi)}. Levanta ThreadError se negado."""
    if is_admin(user):
        return True  # moderação enxerga qualquer thread

    if str(user.id) not in participants:
        raise ThreadError(NOT_A_PARTICIPANT, status=403)

    if isinstance(scope_obj, Rentals):
        if not participants.issubset(rental_participants(scope_obj)):
            raise ThreadError(NOT_A_PARTICIPANT, status=403)
    else:
        owner_id = posting_owner_id(scope_obj)
        if not owner_id or str(owner_id) not in participants:
            raise ThreadError(NOT_A_PARTICIPANT, status=403)
    return True


def can_write(
    user: Users,
    scope: str,
    scope_obj: ScopeObject,
    participants: set[str],
    thread_has_messages: bool,
) -> bool:
    """Como can_read, mais as regras de escrita. Levanta ThreadError se negado."""
    can_read(user, scope, scope_obj, participants)

    # Admin é read-only no chat: evita que a moderação injete mensagem numa
    # thread que ela mesma está julgando.
    if is_admin(user):
        raise ThreadError(CANNOT_WRITE, status=403)

    if isinstance(scope_obj, Postings):
        if not thread_has_messages:
            if str(user.id) == str(posting_owner_id(scope_obj)):
                raise ThreadError(
                    "Só o interessado pode iniciar a conversa sobre um anúncio.", status=403
                )
            if (scope_obj.status or "").lower() != PostingStatus.ACTIVE:
                raise ThreadError("Este anúncio não está disponível para contato.", status=403)
    elif (scope_obj.status or "").lower() == RentalStatus.CANCELLED:
        # Locação cancelada vira somente leitura; o histórico continua acessível.
        raise ThreadError(CANNOT_WRITE, status=403)

    return True


def can_write_bool(
    user: Users,
    scope: str,
    scope_obj: ScopeObject,
    participants: set[str],
    thread_has_messages: bool,
) -> bool:
    try:
        return can_write(user, scope, scope_obj, participants, thread_has_messages)
    except ThreadError:
        return False
