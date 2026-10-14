"""Consultas de leitura do chat.

O inbox é SQL cru de propósito: a ORM não expressa "última linha por grupo
derivado" sem agregados de contrib.postgres e gambiarra de ordenação. Fica
isolado aqui para que uma renomeação de coluna quebre em um lugar só.

Custo honesto: LEAST/GREATEST em uuid não é amigável a índice, então o CTE
`mine` varre todas as mensagens que o usuário já enviou ou recebeu antes de
agregar. Confortável até ~10^4 mensagens por usuário; perceptível em 10^5.
O gatilho para migrar para uma tabela `conversations` está no plano (§10).
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from django.db import connection

from chat.threads import SCOPE_POSTING, SCOPE_RENTAL, format_thread_id

_INBOX_SQL = """
WITH mine AS (
    SELECT m.id, m.sender_id, m.receiver_id, m.rental_id, m.posting_id,
           m.content, m.sent_at, m.read_at, m.hidden_at,
           m.flagged_for_moderation, m.client_id,
           CASE WHEN m.rental_id IS NOT NULL THEN 'rental' ELSE 'posting' END AS scope,
           COALESCE(m.rental_id, m.posting_id)  AS scope_id,
           -- uuid direto, sem ::text: cast tornaria a ordem dependente de
           -- collation e o Python discordaria da chave da thread.
           LEAST(m.sender_id, m.receiver_id)    AS peer_lo,
           GREATEST(m.sender_id, m.receiver_id) AS peer_hi
    FROM messages m
    WHERE m.sender_id = %(me)s OR m.receiver_id = %(me)s
),
agg AS (
    SELECT scope, scope_id, peer_lo, peer_hi,
           MAX(sent_at) AS last_sent_at,
           COUNT(*) FILTER (WHERE receiver_id = %(me)s AND read_at IS NULL) AS unread_count
    FROM mine
    {scope_filter}
    GROUP BY 1, 2, 3, 4
)
SELECT a.scope, a.scope_id, a.peer_lo, a.peer_hi, a.last_sent_at, a.unread_count,
       l.id, l.sender_id, l.receiver_id, l.content, l.sent_at, l.read_at,
       l.hidden_at, l.flagged_for_moderation, l.client_id,
       COUNT(*) OVER () AS total_threads
FROM agg a
JOIN LATERAL (
    SELECT * FROM mine mm
    WHERE mm.scope = a.scope AND mm.scope_id = a.scope_id
      AND mm.peer_lo = a.peer_lo AND mm.peer_hi = a.peer_hi
    ORDER BY mm.sent_at DESC, mm.id DESC
    LIMIT 1
) l ON TRUE
ORDER BY a.last_sent_at DESC
LIMIT %(limit)s OFFSET %(offset)s
"""


@dataclass(frozen=True)
class InboxMessageRow:
    """Última mensagem da thread como vem do SQL, no formato que `serialize_message` lê."""

    id: UUID
    sender_id: UUID
    receiver_id: UUID
    rental_id: UUID | None
    posting_id: UUID | None
    content: str
    sent_at: datetime | None
    read_at: datetime | None
    hidden_at: datetime | None
    flagged_for_moderation: bool
    client_id: UUID | None


@dataclass(frozen=True)
class InboxThreadRow:
    thread_id: str
    scope: str
    scope_id: UUID
    peer_lo: UUID
    peer_hi: UUID
    unread_count: int
    last_message: InboxMessageRow


def inbox_page(
    user_id: UUID, limit: int = 20, offset: int = 0, scope: str | None = None
) -> tuple[list[InboxThreadRow], int]:
    """-> (threads, total). Sem hidratar peer nem rótulo."""
    scope_filter = ""
    params: dict[str, Any] = {"me": str(user_id), "limit": limit, "offset": offset}
    if scope in (SCOPE_RENTAL, SCOPE_POSTING):
        scope_filter = "WHERE scope = %(scope)s"
        params["scope"] = scope

    with connection.cursor() as cursor:
        cursor.execute(_INBOX_SQL.format(scope_filter=scope_filter), params)
        rows = cursor.fetchall()

    if not rows:
        return [], 0

    total = int(rows[0][15])
    threads = []
    for row in rows:
        (
            scope_value,
            scope_id,
            peer_lo,
            peer_hi,
            _last_sent_at,
            unread,
            message_id,
            sender_id,
            receiver_id,
            content,
            sent_at,
            read_at,
            hidden_at,
            flagged,
            client_id,
            _total,
        ) = row
        threads.append(
            InboxThreadRow(
                thread_id=format_thread_id(scope_value, scope_id, peer_lo, peer_hi),
                scope=scope_value,
                scope_id=scope_id,
                peer_lo=peer_lo,
                peer_hi=peer_hi,
                unread_count=int(unread),
                last_message=InboxMessageRow(
                    id=message_id,
                    sender_id=sender_id,
                    receiver_id=receiver_id,
                    rental_id=scope_id if scope_value == SCOPE_RENTAL else None,
                    posting_id=scope_id if scope_value == SCOPE_POSTING else None,
                    content=content,
                    sent_at=sent_at,
                    read_at=read_at,
                    hidden_at=hidden_at,
                    flagged_for_moderation=bool(flagged),
                    client_id=client_id,
                ),
            )
        )
    return threads, total


def unread_counts(user_id: UUID | str) -> dict[str, int]:
    """Badge da navbar. Usa o índice parcial idx_messages_unread."""
    sql = """
        SELECT COUNT(*) AS total,
               COUNT(DISTINCT (
                   COALESCE(rental_id, posting_id),
                   LEAST(sender_id, receiver_id),
                   GREATEST(sender_id, receiver_id)
               )) AS threads
        FROM messages
        WHERE receiver_id = %(me)s AND read_at IS NULL
    """
    with connection.cursor() as cursor:
        cursor.execute(sql, {"me": str(user_id)})
        row = cursor.fetchone()
    total, threads = row if row else (0, 0)
    return {"unread_total": int(total or 0), "unread_threads": int(threads or 0)}
