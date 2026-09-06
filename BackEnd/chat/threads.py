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

SCOPE_RENTAL = 'rental'
SCOPE_POSTING = 'posting'
VALID_SCOPES = (SCOPE_RENTAL, SCOPE_POSTING)

ROLE_ADMIN = 'admin'


class ThreadError(Exception):
    """Erro de negócio com mensagem pronta para o cliente (em português)."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def format_thread_id(scope, scope_id, user_a, user_b):
    if scope not in VALID_SCOPES:
        raise ThreadError('Identificador de conversa inválido.')
    lo, hi = sorted([str(user_a), str(user_b)])
    if lo == hi:
        raise ThreadError('Identificador de conversa inválido.')
    return f'{scope}:{scope_id}:{lo}:{hi}'


def parse_thread_id(thread_id):
    """-> (scope, scope_id: UUID, lo: UUID, hi: UUID). Levanta ThreadError."""
    parts = (thread_id or '').split(':')
    if len(parts) != 4:
        raise ThreadError('Identificador de conversa inválido.')
    scope, scope_id, lo, hi = parts
    if scope not in VALID_SCOPES:
        raise ThreadError('Identificador de conversa inválido.')
    try:
        scope_uuid = uuid.UUID(scope_id)
        lo_uuid = uuid.UUID(lo)
        hi_uuid = uuid.UUID(hi)
    except (ValueError, AttributeError, TypeError) as exc:
        raise ThreadError('Identificador de conversa inválido.') from exc
    if str(lo_uuid) == str(hi_uuid):
        raise ThreadError('Identificador de conversa inválido.')
    # Recusa uma chave que não esteja na forma canônica: senão o mesmo par de
    # usuários geraria dois thread_ids diferentes e dois grupos de fan-out.
    if sorted([str(lo_uuid), str(hi_uuid)]) != [str(lo_uuid), str(hi_uuid)]:
        raise ThreadError('Identificador de conversa inválido.')
    return scope, scope_uuid, lo_uuid, hi_uuid


def group_name(thread_id):
    """Nome do grupo no channel layer.

    Grupos do Channels aceitam só [a-zA-Z0-9._-] e ~100 chars; o thread_id tem
    dois-pontos e é longo demais, então vai hasheado.
    """
    return 'chat.' + hashlib.sha256(thread_id.encode()).hexdigest()[:32]


def user_group_name(user_id):
    return 'chat.user.' + uuid.UUID(str(user_id)).hex


# --------------------------------------------------------------------------
# Participantes
# --------------------------------------------------------------------------

def rental_participants(rental):
    """{lessee, dono do maquinário, operador (se houver)}."""
    ids = {str(rental.lessee_id)}
    owner_id = _rental_owner_id(rental)
    if owner_id:
        ids.add(str(owner_id))
    if rental.operator_id:
        ids.add(str(rental.operator_id))
    return ids


def _rental_owner_id(rental):
    posting = getattr(rental, 'postings', None)
    machinery = getattr(posting, 'machinery', None) if posting else None
    return getattr(machinery, 'owner_id', None) if machinery else None


def posting_owner_id(posting):
    machinery = getattr(posting, 'machinery', None)
    return getattr(machinery, 'owner_id', None) if machinery else None


def load_scope(scope, scope_id):
    """Carrega Rentals/Postings já com os joins que a autorização precisa."""
    from api.models import Rentals
    from postings.models import Postings

    if scope == SCOPE_RENTAL:
        try:
            return Rentals.objects.select_related('postings__machinery').get(id=scope_id)
        except Rentals.DoesNotExist as exc:
            raise ThreadError('Locação não encontrada.', status=404) from exc
    try:
        return Postings.objects.select_related('machinery').get(id=scope_id)
    except Postings.DoesNotExist as exc:
        raise ThreadError('Anúncio não encontrado.', status=404) from exc


def is_admin(user):
    return getattr(user, 'role', None) == ROLE_ADMIN


def can_read(user, scope, scope_obj, participants):
    """participants = {str(lo), str(hi)}. Levanta ThreadError se negado."""
    if is_admin(user):
        return True  # moderação enxerga qualquer thread

    if str(user.id) not in participants:
        raise ThreadError('Você não participa desta conversa.', status=403)

    if scope == SCOPE_RENTAL:
        if not participants.issubset(rental_participants(scope_obj)):
            raise ThreadError('Você não participa desta conversa.', status=403)
    else:
        owner_id = posting_owner_id(scope_obj)
        if not owner_id or str(owner_id) not in participants:
            raise ThreadError('Você não participa desta conversa.', status=403)
    return True


def can_write(user, scope, scope_obj, participants, thread_has_messages):
    """Como can_read, mais as regras de escrita. Levanta ThreadError se negado."""
    can_read(user, scope, scope_obj, participants)

    # Admin é read-only no chat: evita que a moderação injete mensagem numa
    # thread que ela mesma está julgando.
    if is_admin(user):
        raise ThreadError('Você não pode enviar mensagens nesta conversa.', status=403)

    if scope == SCOPE_POSTING:
        owner_id = posting_owner_id(scope_obj)
        if not thread_has_messages:
            if str(user.id) == str(owner_id):
                raise ThreadError(
                    'Só o interessado pode iniciar a conversa sobre um anúncio.', status=403
                )
            if (scope_obj.status or '').lower() != 'active':
                raise ThreadError(
                    'Este anúncio não está disponível para contato.', status=403
                )
    elif (scope_obj.status or '').lower() == 'cancelled':
        # Locação cancelada vira somente leitura; o histórico continua acessível.
        raise ThreadError('Você não pode enviar mensagens nesta conversa.', status=403)

    return True


def can_write_bool(user, scope, scope_obj, participants, thread_has_messages):
    try:
        return can_write(user, scope, scope_obj, participants, thread_has_messages)
    except ThreadError:
        return False
