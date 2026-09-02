# Implementation Plan — Real-time Chat (Frota Rural)

> FROZEN. Section 3 is a binding contract. No agent may deviate from it without
> escalating to the coordinator.

## 1. Goal & constraints

Ship 1:1 real-time messaging scoped to a rental **or** a posting inquiry, with read
receipts, unread badges, and moderation, on Postgres as the single source of truth.

- **Postgres only.** No Firestore, no dual-write. `Database/schema.sql` is a checked-in
  artifact and must stay in sync.
- **No `conversations` table.** Threads are derived from `messages` columns.
- **Backend and frontend build in parallel** against the contract in §3, which is frozen.
- The repo is mid-migration away from the catch-all `api` app (`BackEnd/api/models.py:17-18`).
  Chat must not add to `api`.
- Existing `Messages` rows may exist in dev DBs; the migration must be non-destructive.
- Dev runs under `docker compose` with hot reload via bind mounts; the ASGI switch must not
  kill autoreload.

### ENVIRONMENT NOTE (read this)

Docker Desktop on this machine is BROKEN (corrupted containerd metadata store) and will not
be repaired in this session. `docker compose up` cannot run. All container work must still be
WRITTEN correctly, but it cannot be executed or verified. Mark such deliverables
"written, unverified in container".

A working local path exists and is the primary dev/verification path for now:
- `BackEnd/venv/bin/python` — Python 3.14.5 with Django 6.0.3 already installed.
- Local Postgres on `localhost:5432`, databases `frota_rural` and `frota_rural_dev` exist.
- `channels` / `channels_redis` / `daphne` are NOT installed locally yet.
- Redis is NOT running and NOT installed. Homebrew is at `/opt/homebrew/bin/brew`.

Consequently: consumer tests MUST use Channels' `InMemoryChannelLayer` via
`@override_settings`, so they need no Redis. Only real cross-process group fan-out stays
unverified.

---

## 2. New Django app: `chat` (not `api`)

**Decision: new `BackEnd/chat/` app.** `api/models.py:17-18` states the team's goal is to
dissolve `api`; there is a working precedent for moving a model out of it without touching
the database — `BackEnd/contracts/migrations/0001_initial.py:20-23` (state-only `CreateModel`)
paired with `BackEnd/api/migrations/0003_move_contracts_to_contracts_app.py:15-22` (state-only
`DeleteModel`). Chat also needs app-local non-model modules (consumers, routing, ASGI
middleware) that have no business inside `api`.

`Rentals` and `Reviews` stay in `api` for now. `chat.Messages.rental` points at `'api.Rentals'`
by string reference — no circular import, `api` never imports `chat`.

### Files to create

| Path | Purpose |
|---|---|
| `BackEnd/chat/__init__.py` | empty |
| `BackEnd/chat/apps.py` | `ChatConfig`, `name = 'chat'` — mirror `BackEnd/contracts/apps.py` |
| `BackEnd/chat/models.py` | `Messages` (moved from `api`) + `MessageReports` |
| `BackEnd/chat/threads.py` | thread-key parse/format, participant resolution, authorization predicates. **Single source of truth for authz** — REST views and the consumer both call it. |
| `BackEnd/chat/selectors.py` | raw-SQL inbox aggregate + unread counters |
| `BackEnd/chat/serializer.py` | DRF serializers (singular filename, matching `users/serializer.py`, `postings/serializer.py`, `contracts/serializer.py`) |
| `BackEnd/chat/services.py` | `create_message()` — the one write path shared by REST and WS (validation, banned-word flag, idempotency, channel-layer fan-out) |
| `BackEnd/chat/moderation.py` | banned-word matching |
| `BackEnd/chat/views.py` | `@api_view` function views, `@extend_schema`-annotated |
| `BackEnd/chat/urls.py` | urlpatterns |
| `BackEnd/chat/routing.py` | `websocket_urlpatterns` |
| `BackEnd/chat/middleware.py` | `JWTAuthMiddleware` for ASGI |
| `BackEnd/chat/consumers.py` | `ChatConsumer`; module docstring holds the WS contract |
| `BackEnd/chat/tests.py` | REST + consumer + authz tests |
| `BackEnd/chat/migrations/__init__.py` | empty |
| `BackEnd/chat/migrations/0001_initial.py` | state-only `CreateModel(Messages)` |
| `BackEnd/chat/migrations/0002_thread_scope_read_receipts.py` | the real DDL (§4) |
| `BackEnd/chat/migrations/0003_messagereports.py` | new table |
| `BackEnd/api/migrations/0004_move_messages_to_chat_app.py` | state-only `DeleteModel(Messages)` |

### Files to modify

| Path | Change | Owner |
|---|---|---|
| `BackEnd/api/models.py:19-30` | delete the `Messages` class | backend |
| `BackEnd/djangoapi/urls.py:34` | add `path(BASE_PATH, include('chat.urls'))` after `document_validation` | backend |
| `BackEnd/administration/views.py` | add moderation-queue views at the end | backend |
| `BackEnd/administration/urls.py:16` | add two admin routes | backend |
| `BackEnd/administration/serializer.py` | add `MessageModerationDecisionSerializer` | backend |
| `Database/schema.sql:179-188` | rewrite `messages`, add `message_reports` | backend |
| `BackEnd/djangoapi/settings.py` | INSTALLED_APPS, `ASGI_APPLICATION`, `CHANNEL_LAYERS`, `CHAT_BANNED_WORDS`, spectacular tag | **infra** |
| `BackEnd/djangoapi/asgi.py` | ProtocolTypeRouter | **infra** |
| `BackEnd/docs/requirements.txt` | new pins | **infra** |
| `compose.yaml`, `.env.example`, `Devops/README.md`, `Devops/docker/backend/entrypoint.sh` | redis + ASGI | **infra** |

---

## 3. FROZEN API CONTRACT

> Everything in this section is binding. Field names are `snake_case` (matching every
> existing serializer). Timestamps are ISO-8601 UTC with `Z` (`2026-09-01T14:03:22.481Z`).
> UUIDs are lowercase dashed strings. User-facing error strings are **Portuguese**
> (matching `administration/views.py:58`, `api/views.py:91`).

### 3.0 The thread key

```
thread_id := "<scope>:<scope_id>:<user_a>:<user_b>"
```
- `scope` in `"rental"` | `"posting"`
- `scope_id` = the rental UUID or the posting UUID
- `user_a`, `user_b` = the two participant UUIDs, **sorted ascending as lowercase dashed
  strings** (`sorted([str(x), str(y)])`).

Example:
`rental:08e8eaa6-467f-4c98-b5c0-93323829911d:029d15f3-a577-4238-9c59-42011ddcb5be:e6a2b8e5-3d71-4a9f-b98a-f4c78d0671f2`

Rules:
- The client **never constructs** a `thread_id` itself. It obtains one from
  `POST /api/chat/threads/resolve` or from the inbox. It may store and re-use it.
- In URL paths the client **must** `encodeURIComponent(thread_id)`; the server receives the
  decoded value.
- Sorting must agree between Python and SQL. Python: `sorted([str(a), str(b)])`.
  SQL: `LEAST(sender_id, receiver_id)` / `GREATEST(...)` **on the `uuid` columns directly,
  never cast to `text`** — uuid comparison is byte-wise and matches Python's hex-lexicographic
  order regardless of DB collation. Casting to text would make the result collation-dependent.
- Channels group name (server-internal, never exposed):
  `"chat." + sha256(thread_id.encode()).hexdigest()[:32]`. Required because Channels group
  names are limited to ~100 chars and `[a-zA-Z0-9._-]` — colons are illegal.
- Per-user group name: `"chat.user." + user_id.hex` (32 hex chars, valid).

### 3.1 Common shapes

**`ChatUser`**
```json
{ "id": "e6a2b8e5-3d71-4a9f-b98a-f4c78d0671f2", "name": "José Almeida", "role": "locatario" }
```

**`ChatMessage`**
```json
{
  "id": "3f1c...",
  "thread_id": "rental:08e8...:029d...:e6a2...",
  "sender_id": "e6a2...",
  "receiver_id": "029d...",
  "content": "Boa tarde, o trator está disponível na semana que vem?",
  "sent_at": "2026-09-01T14:03:22.481Z",
  "read_at": null,
  "flagged_for_moderation": false,
  "hidden": false,
  "client_id": "b0b0c0d0-1111-2222-3333-444455556666"
}
```
- `content` is `null` when `hidden` is `true`. UI renders "Mensagem removida pela moderação."
- `client_id` is echoed on every message, to every recipient. It is `null` for messages created
  before this feature or without one.
- `read_at` is non-null only once the **receiver** has read it. Senders see their own `read_at`
  to render the double-check.

**`ChatThread`**
```json
{
  "thread_id": "posting:f5e1c4a0-...:029d...:e6a2...",
  "scope": "posting",
  "scope_id": "f5e1c4a0-56d1-4b7c-9a1b-c1d4e6f8a9b2",
  "scope_label": "John Deere 6135J",
  "peer": { "id": "029d...", "name": "Tratores & Cia LTDA", "role": "locador" },
  "can_write": true,
  "unread_count": 3,
  "last_message": { }
}
```
- `scope_label` = `"<machine_brand> <machine_model>"` trimmed, falling back to
  `"Locação #CTR-08E8"` for rentals with no machine data, or `"Anúncio"`.
- `peer` is always the *other* participant relative to the caller.
- `last_message` is `null` only for a freshly resolved thread with zero messages.

**Error bodies**
- 400 validation (serializer): `{"content": ["Este campo não pode ser em branco."]}` — DRF's
  native dict-of-lists.
- 400/403/404/409 business rule: `{"error": "Mensagem em português."}` — matches
  `ErrorResponseSerializer` in `BackEnd/api/schemas.py:17`.
- 401: `{"detail": "..."}` — emitted by DRF/SimpleJWT, untouched.

### 3.2 REST endpoints

All under `api/`. All require `Authorization: Bearer <access>`. All return 401
`{"detail": ...}` when unauthenticated.

**A. `POST /api/chat/threads/resolve`** — open/locate a conversation

Request:
```json
{ "scope": "posting", "scope_id": "f5e1c4a0-56d1-4b7c-9a1b-c1d4e6f8a9b2" }
```
Optional third field for the rental case where more than one counterparty exists (lessor *and*
operator):
```json
{ "scope": "rental", "scope_id": "08e8...", "peer_id": "029d..." }
```

Peer derivation when `peer_id` is omitted:
- `scope=posting`: peer = the posting's owner (`postings.machinery.owner`). If the caller **is**
  the owner, 400 `{"error": "Informe com qual usuário deseja conversar."}`.
- `scope=rental`: peer = the single other participant if the caller's counterpart is
  unambiguous (lessee <-> lessor when no operator is assigned). If ambiguous, 400
  `{"error": "Informe com qual participante da locação deseja conversar."}`.

Responses:
- `200` -> `ChatThread` (this endpoint creates nothing; it is idempotent).
- `400` -> `{"error": "..."}` (bad scope value, self-chat, ambiguous peer).
- `403` -> `{"error": "Você não participa desta conversa."}`
- `404` -> `{"error": "Locação não encontrada."}` / `{"error": "Anúncio não encontrado."}`

**B. `GET /api/chat/threads/`** — inbox

Query params: `limit` (default `20`, max `50`), `offset` (default `0`), `scope` (optional
filter, `rental`|`posting`).

`200`:
```json
{ "count": 7, "limit": 20, "offset": 0, "results": [] }
```
Ordered by `last_message.sent_at` DESC. `count` is the total number of derived threads for the
caller.

Pagination is **offset-based here** (the set is small and re-sorts on every new message, so a
cursor would be meaningless). Implemented by hand in the view — **do not add
`DEFAULT_PAGINATION_CLASS` to `REST_FRAMEWORK`**; it would change the response shape of every
existing endpoint (`reviews_list`, `rentals_list`, `postings`).

**C. `GET /api/chat/threads/<thread_id>/messages`** — history (keyset pagination)

`<thread_id>` is a single URL-encoded path segment; Django route uses `<str:thread_id>`.

| Param | Type | Meaning |
|---|---|---|
| `limit` | int, default `50`, max `200` | page size |
| `before` | ISO-8601 | return messages with `(sent_at, id) < (before, before_id)` |
| `before_id` | uuid | tie-breaker, **required if `before` is given** |
| `after` | ISO-8601 | return messages with `(sent_at, id) > (after, after_id)` |
| `after_id` | uuid | tie-breaker, **required if `after` is given** |

`200`:
```json
{ "results": [], "has_more": true, "order": "desc" }
```
- No cursor, or `before`/`before_id`: `order = "desc"` (newest first). Scroll-back path.
- `after`/`after_id`: `order = "asc"` (oldest first). **Reconnect catch-up** path.
- `has_more` = there are more rows beyond this page in the requested direction.

Errors: `400` `{"error": "Informe before_id junto de before."}`, `400`
`{"error": "Identificador de conversa inválido."}`, `403`, `404`.

**D. `POST /api/chat/threads/<thread_id>/messages`** — send (REST fallback)

Request:
```json
{ "content": "Boa tarde!", "client_id": "b0b0c0d0-1111-2222-3333-444455556666" }
```
- `content`: required, non-blank after strip, **max 4000 chars**.
- `client_id`: required, uuid v4 generated by the client.

Responses:
- `201` -> `ChatMessage`. Also fans out over the channel layer exactly as a WS send would.
- `200` -> `ChatMessage` when `(sender_id, client_id)` already exists — **idempotent replay**,
  no duplicate row.
- `400` -> serializer dict (`content` too long/blank) or `{"error": "..."}`.
- `403` -> `{"error": "Você não pode enviar mensagens nesta conversa."}` (includes admins —
  admins are read-only).
- `404` -> `{"error": "Conversa não encontrada."}`
- `429` -> `{"error": "Muitas mensagens em pouco tempo. Aguarde alguns segundos."}`
  (limit: 20 messages / 10 s per user).

**E. `POST /api/chat/threads/<thread_id>/read`** — mark read

Request: `{ "up_to": "2026-09-01T14:03:22.481Z" }`

`up_to` optional; when omitted, marks the whole thread read. Only rows where the caller is the
**receiver** and `read_at IS NULL` are touched.

`200`: `{ "updated": 3, "read_at": "2026-09-01T14:05:00.000Z", "unread_total": 1 }`

Also emits `message.read` to the thread group and `unread.updated` to the caller's user group.

Errors: `403`, `404`.

**F. `GET /api/chat/unread`** — navbar badge

`200`: `{ "unread_total": 4, "unread_threads": 2 }`

Cheap (partial index). Called once at app boot and after reconnect; otherwise the badge is
driven by `unread.updated` WS frames.

**G. `POST /api/chat/messages/<uuid:pk>/report`** — report a message

Request: `{ "reason": "Conteúdo ofensivo e ameaças." }` — required, non-blank, max 1000.

- `200` -> `{"message": "Mensagem denunciada. Nossa equipe vai analisar."}` (matches
  `MessageResponseSerializer`, `BackEnd/api/schemas.py:11`). Sets
  `messages.flagged_for_moderation = true` and inserts a `message_reports` row.
- `400` -> `{"error": "Informe o motivo da denúncia."}` (mirrors `reject_posting`,
  `administration/views.py:196`).
- `403` -> `{"error": "Você não participa desta conversa."}`
- `404` -> `{"error": "Mensagem não encontrada."}`
- `409` -> `{"error": "Você já denunciou esta mensagem."}`

**H. `GET /api/admin/chat/messages/`** — moderation queue (admin only)

Query params: `status` (`pending`|`resolved`, default `pending`), `source`
(`report`|`auto`|`all`, default `all`), `limit` (default 25, max 100), `offset`.

`200`:
```json
{
  "count": 12, "limit": 25, "offset": 0,
  "results": [{
    "message_id": "3f1c...",
    "thread_id": "rental:...",
    "content": "",
    "sent_at": "2026-09-01T14:03:22.481Z",
    "hidden": false,
    "sender": { "id": "...", "name": "...", "role": "locatario" },
    "receiver": { "id": "...", "name": "...", "role": "locador" },
    "source": "report",
    "reports": [{
      "id": "...", "reason": "Conteúdo ofensivo.",
      "reported_by": { "id": "...", "name": "...", "role": "locador" },
      "created_at": "2026-09-01T14:10:00.000Z",
      "resolution": null, "resolved_at": null, "resolved_by": null
    }]
  }]
}
```
`source` is `"report"` when at least one `message_reports` row exists, else `"auto"`
(banned-word flag).

`403` -> `{"error": "Acesso restrito a administradores."}`

**I. `PUT /api/admin/chat/messages/<uuid:pk>/resolve`** — admin decision

Request: `{ "decision": "hide", "note": "Ameaça direta ao locador." }`

`decision` in `"dismiss"` | `"hide"`. `note` optional, max 1000.

- `dismiss`: `flagged_for_moderation = false`, `hidden_at` untouched, open reports resolved as
  `dismissed`.
- `hide`: `flagged_for_moderation` stays `true`, `hidden_at = now()`, open reports resolved as
  `upheld`. Emits `message.hidden` to the thread group.
- `200` -> `{"message": "Denúncia arquivada."}` / `{"message": "Mensagem ocultada da conversa."}`
- `400` -> `{"error": "Decisão inválida."}`
- `403`, `404` as above.

PUT (not PATCH) to match `administration/urls.py:12-16`.

### 3.3 WebSocket contract

**Single multiplexed connection per client.** One socket, one auth handshake, one reconnect
path. Thread subscriptions are dynamic.

**Connect URL**
```
ws://localhost:8000/ws/chat          (dev)
wss://<host>/ws/chat                 (prod)
```
Derived on the frontend from `VITE_API_BASE_URL` by stripping the trailing `api/` and swapping
`http`->`ws` / `https`->`wss`. Add `VITE_WS_BASE_URL` to `.env.example` as an override.

**Auth handshake — Sec-WebSocket-Protocol subprotocol**
```js
new WebSocket(url, ["bearer", accessToken]);
```
Server verifies, then **must** call `await self.accept(subprotocol="bearer")`. If the server
omits the subprotocol on accept, every browser closes the connection immediately — this is the
single most likely integration bug.

Why not the alternatives:
- **Query param `?token=`**: the access token lands in Daphne/nginx access logs and in log
  aggregation. **Rejected.**
- **Cookie**: the refresh cookie is deliberately scoped to `path=/api/login`
  (`BackEnd/authentication/views.py:98`) so it is never sent to `/ws/`. Widening it to `/` would
  expose it to every request and the WS handshake is not CSRF-protected. **Rejected.**
- **Subprotocol**: token never appears in a URL or a log line, works with the browser
  `WebSocket` API which cannot set headers. JWT charset (base64url + `.`) is a valid RFC 7230
  token. **Chosen.**

**Close codes**

| Code | Meaning | Client behaviour |
|---|---|---|
| `1000` | normal (client-initiated) | do not reconnect |
| `1006`/`1011` | transport/server error | reconnect with backoff |
| `4401` | token missing/invalid/expired (rejected **before** accept) | refresh the access token, retry **once** immediately; on a second 4401, log out |
| `4403` | authenticated but forbidden | stop reconnecting, toast, navigate to `/mensagens` |
| `4429` | rate limited | wait 30 s, then reconnect |

**Client -> server frames**

```json
{ "type": "thread.subscribe", "thread_id": "rental:" }
```
Server replies `thread.subscribed` on success, or `error` with `code: "forbidden"` /
`"not_found"` / `"invalid_thread"`. The socket stays open on a per-thread failure — only
connection-level failures close it.

```json
{ "type": "thread.unsubscribe", "thread_id": "rental:" }
```
No reply.

```json
{ "type": "message.send", "thread_id": "rental:", "content": "Boa tarde!", "client_id": "b0b0" }
```
Requires a prior successful `thread.subscribe` for that `thread_id`.

```json
{ "type": "message.read", "thread_id": "rental:", "up_to": "2026-09-01T14:03:22.481Z" }
```
`up_to` optional.

```json
{ "type": "typing", "thread_id": "rental:", "is_typing": true }
```
Not persisted. Server relays to the other participant only. Client throttles to at most one
frame per 2 s.

```json
{ "type": "ping" }
```
Server replies `{"type":"pong","server_time":"Z"}`. Client sends every 25 s.

**Server -> client frames**

```json
{ "type": "thread.subscribed", "thread_id": "", "thread": {} }
```

```json
{ "type": "message.new", "thread_id": "", "message": {} }
```
Delivered to every subscriber of the thread group **including the sender**. The sender
reconciles its optimistic bubble by `message.client_id`. Everyone dedupes by `message.id`.

```json
{ "type": "message.read", "thread_id": "", "reader_id": "029d", "up_to": "Z", "message_ids": ["3f1c"] }
```
`message_ids` lists exactly the rows whose `read_at` transitioned. Capped at 500; if more were
updated, the client should refetch the page.

```json
{ "type": "message.hidden", "thread_id": "", "message_id": "3f1c" }
```

```json
{ "type": "typing", "thread_id": "", "user_id": "029d", "is_typing": true }
```

```json
{ "type": "unread.updated", "unread_total": 4, "unread_threads": 2 }
```
Sent on the user-scoped group whenever the caller's unread numbers change. Drives the navbar
badge.

```json
{ "type": "thread.updated", "thread": {} }
```
Sent on the user-scoped group when a thread's last message or unread count changes, so an open
inbox re-sorts without polling.

```json
{ "type": "error", "code": "forbidden", "message": "Você não participa desta conversa." }
```
`code` in `"invalid_payload"` | `"invalid_thread"` | `"not_found"` | `"forbidden"` |
`"not_subscribed"` | `"rate_limited"` | `"too_long"` | `"server_error"`. `message` is Portuguese
and safe to surface in a `toast.error()`.

Unknown `type` from the client -> `error` with `code: "invalid_payload"`; never close the
socket for it.

---

## 4. Migration plan

### 4.1 `chat/migrations/0001_initial.py` — state only, no DDL

Copy the structure of `contracts/migrations/0001_initial.py:20-45`:
```
initial = True
dependencies = [("api", "0003_move_contracts_to_contracts_app"),
                ("postings", "0003_postings_max_reservation_days"),
                migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
operations = [SeparateDatabaseAndState(database_operations=[],
              state_operations=[CreateModel("Messages", ..., options={"db_table": "messages"})])]
```
The field set must be byte-identical to `api/migrations/0001_initial.py:49-61` — same
nullability, same `related_name='messages_receiver_set'`, same `DO_NOTHING`. Any drift produces
a spurious `AlterField` later.

### 4.2 `api/migrations/0004_move_messages_to_chat_app.py` — state only

```
dependencies = [("api", "0003_move_contracts_to_contracts_app"), ("chat", "0001_initial")]
operations = [SeparateDatabaseAndState(database_operations=[],
              state_operations=[DeleteModel("Messages")])]
```
Delete `Messages` from `BackEnd/api/models.py:19-30` in the same commit.

### 4.3 `chat/migrations/0002_thread_scope_read_receipts.py` — the real DDL

In this order:

1. `AlterField('messages', 'rental')` -> `ForeignKey('api.Rentals', on_delete=DO_NOTHING,
   null=True, blank=True)`. Metadata-only, no rewrite.
2. `AddField('messages', 'posting')` -> `ForeignKey('postings.Postings',
   on_delete=DO_NOTHING, null=True, blank=True, db_column='posting_id',
   related_name='messages')`.
3. `AddField('messages', 'read_at')` -> `DateTimeField(null=True, blank=True, db_index=False)`.
4. `AddField('messages', 'client_id')` -> `UUIDField(null=True, blank=True)`.
5. `AddField('messages', 'hidden_at')` -> `DateTimeField(null=True, blank=True)`.
6. **Backfill + tighten `sent_at`.** `RunSQL("UPDATE messages SET sent_at =
   COALESCE(sent_at, CURRENT_TIMESTAMP) WHERE sent_at IS NULL", reverse_sql=RunSQL.noop)` then
   `AlterField('sent_at')` -> `DateTimeField(default=timezone.now)` (not null).
   **Load-bearing**: keyset pagination on `(sent_at, id)` is incorrect if `sent_at` can be null.
7. **Backfill + tighten `flagged_for_moderation`.** `UPDATE messages SET
   flagged_for_moderation = COALESCE(flagged_for_moderation, false)` then `AlterField` ->
   `BooleanField(default=False)` (not null).
8. `AddConstraint` — exactly one scope:
   ```python
   CheckConstraint(
       condition=Q(rental__isnull=False, posting__isnull=True) | Q(rental__isnull=True, posting__isnull=False),
       name="messages_exactly_one_scope",
   )
   ```
   Django 6 uses `condition=`, not the removed `check=`.
9. `AddConstraint` — send idempotency:
   ```python
   UniqueConstraint(fields=["sender", "client_id"], condition=Q(client_id__isnull=False),
                    name="messages_sender_client_id_uniq")
   ```
10. `RunSQL DROP INDEX IF EXISTS idx_messages_rental_id` — superseded by the composite below.
11. `AddIndex` x5 (`Meta.indexes`):

    | Name | Definition | Serves |
    |---|---|---|
    | `idx_messages_rental_thread` | `(rental_id, sent_at DESC, id DESC)` | rental thread history |
    | `idx_messages_posting_thread` | `(posting_id, sent_at DESC, id DESC)` | posting thread history |
    | `idx_messages_sender_recent` | `(sender_id, sent_at DESC)` | inbox `mine` CTE |
    | `idx_messages_receiver_recent` | `(receiver_id, sent_at DESC)` | inbox `mine` CTE |
    | `idx_messages_unread` | `(receiver_id)` **partial** `WHERE read_at IS NULL` | unread badge + per-thread unread counts |

    Partial index in Django: `models.Index(fields=["receiver"], name="idx_messages_unread",
    condition=Q(read_at__isnull=True))`.
12. `AddIndex` `idx_messages_flagged`: `(sent_at DESC)` partial `WHERE flagged_for_moderation`
    — the admin queue.

**Data migration for pre-existing rows:** none needed. Existing rows all have `rental_id` set
and `posting_id NULL`, satisfying the check constraint. Step 8 will fail loudly if a dev DB has
orphans — intentional.

### 4.4 `chat/migrations/0003_messagereports.py`

New table `message_reports` (real `CreateModel`, mirroring `administration.PostingModeration`
in style — `BackEnd/administration/models.py:6-39`):

| Column | Type |
|---|---|
| `id` | UUID PK, `default=uuid.uuid4, editable=False` |
| `message_id` | FK `chat.Messages` `ON DELETE CASCADE`, `related_name="reports"` |
| `reported_by_id` | FK `users.Users` `ON DELETE SET NULL`, null, `related_name="message_reports"` |
| `reason` | TEXT not null |
| `resolution` | VARCHAR(20) null, choices `dismissed` / `upheld` |
| `resolution_note` | TEXT null |
| `resolved_by_id` | FK `users.Users` `ON DELETE SET NULL`, null, `related_name="message_report_resolutions"` |
| `resolved_at` | timestamptz null |
| `created_at` | `auto_now_add=True` |

`Meta`: `db_table = "message_reports"`, `ordering = ["-created_at"]`,
`UniqueConstraint(fields=["message", "reported_by"], name="message_reports_unique_reporter")`
(drives the 409).

The report row is created by a *user-facing chat endpoint*, so the model lives in `chat`, and
`administration/views.py` imports it (it already imports `api.models`, `contracts.models`,
`machines.models`, `postings.models`, `users.models`). `PostingModeration` stays where it is.

### 4.5 `Database/schema.sql` — replace lines 179-188

```sql
-- Messages
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL REFERENCES users(id),
    receiver_id UUID NOT NULL REFERENCES users(id),
    -- Uma thread e derivada: ou pertence a uma locacao, ou e uma consulta sobre
    -- um anuncio feita antes de existir locacao. Exatamente um dos dois.
    rental_id UUID REFERENCES rentals(id) ON DELETE CASCADE,
    posting_id UUID REFERENCES postings(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP WITH TIME ZONE,
    hidden_at TIMESTAMP WITH TIME ZONE,
    client_id UUID,
    flagged_for_moderation BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT messages_exactly_one_scope CHECK (
        (rental_id IS NOT NULL AND posting_id IS NULL)
     OR (rental_id IS NULL AND posting_id IS NOT NULL)
    )
);
CREATE UNIQUE INDEX messages_sender_client_id_uniq ON messages (sender_id, client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_messages_rental_thread   ON messages (rental_id, sent_at DESC, id DESC);
CREATE INDEX idx_messages_posting_thread  ON messages (posting_id, sent_at DESC, id DESC);
CREATE INDEX idx_messages_sender_recent   ON messages (sender_id, sent_at DESC);
CREATE INDEX idx_messages_receiver_recent ON messages (receiver_id, sent_at DESC);
CREATE INDEX idx_messages_unread          ON messages (receiver_id) WHERE read_at IS NULL;
CREATE INDEX idx_messages_flagged         ON messages (sent_at DESC) WHERE flagged_for_moderation;

-- Denuncias de mensagens + decisao da moderacao na mesma linha.
CREATE TABLE message_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    reported_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    resolution VARCHAR(20),
    resolution_note TEXT,
    resolved_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (message_id, reported_by_id)
);
CREATE INDEX idx_message_reports_pending ON message_reports (created_at DESC) WHERE resolution IS NULL;
```
The old `CREATE INDEX idx_messages_rental_id` line is deleted.

---

## 5. Authorization rules

Implemented once in `BackEnd/chat/threads.py`; REST views and `ChatConsumer` both call the same
functions. Roles come from `users.Users.role` (`'locador'`, `'locatario'`, `'operador'`,
`'admin'` — `Database/schema.sql:4`).

### Participant sets

```
participants(rental R) = { R.lessee_id,
                           R.postings.machinery.owner_id,
                           R.operator_id if not null }
participants(posting P) = { P.machinery.owner_id } union { any authenticated non-owner }
```

### `can_read(user, scope, scope_id, {a, b})`

| Condition | Result |
|---|---|
| `user.role == 'admin'` | **read allowed** on any thread (moderation) |
| `user.id not in {a, b}` | 403 |
| `scope == rental` and `{a,b}` not subset of `participants(R)` | 403 |
| `scope == posting` and `owner_id not in {a,b}` | 403 |
| `a == b` | 400 invalid thread |
| otherwise | allowed |

### `can_write(user, scope, scope_id, {a, b})`

Everything from `can_read`, plus:

| Condition | Result |
|---|---|
| `user.role == 'admin'` | **403** — admins are read-only in chat. Prevents an admin injecting a message into a moderated thread and keeps the audit story simple. |
| `user.status in ('suspended','banned')` | already blocked at the token layer — `AppJWTAuthentication.get_user` raises (`authentication/extensions/authentication.py:31-35`) |
| `scope == posting`, thread has **zero** messages, and `user.id == owner_id` | 403 `{"error": "Só o interessado pode iniciar a conversa sobre um anúncio."}` — owners cannot cold-DM arbitrary users |
| `scope == posting`, thread has zero messages, and `posting.status != 'active'` | 403 `{"error": "Este anúncio não está disponível para contato."}`. Existing threads stay writable regardless of the posting's later status. |
| `scope == rental`, `R.status == 'cancelled'` | read-only: 403 on write. Cancelled rentals keep their history. |
| otherwise | allowed |

`ChatThread.can_write` in the API response is exactly `can_write(...)`, so the frontend never
has to re-derive any of this.

### `can_report(user, message)`
`user.id in {message.sender_id, message.receiver_id}` and `user.id != message.sender_id` (you
cannot report yourself) -> else 403.

### `is_admin(user)`
`user.role == 'admin'`. Used by endpoints H and I. There is currently no `IsAdmin` permission
class in the repo, so add `BackEnd/administration/permissions.py::IsPlatformAdmin(BasePermission)`
and apply via `@permission_classes([IsAuthenticated, IsPlatformAdmin])` — matching the
`@permission_classes([IsAuthenticated])` style already used at `BackEnd/users/views.py:3-4`.
The existing admin endpoints are unprotected; **do not retrofit them in this pass** (out of
scope, would break the admin UI's current behaviour). Note it as follow-up work.

### ASGI auth middleware — `BackEnd/chat/middleware.py`

```
JWTAuthMiddleware(BaseMiddleware):
    async def __call__(scope, receive, send):
        token = extract from scope["subprotocols"]:
            subprotocols == ["bearer", "<jwt>"]  ->  token = subprotocols[1]
            anything else -> scope["user"] = AnonymousUser; scope["auth_error"] = "missing_token"
        user = await database_sync_to_async(self._authenticate)(token)
        scope["user"] = user or AnonymousUser()
        return await super().__call__(scope, receive, send)

    def _authenticate(token):
        auth = AppJWTAuthentication()                  # the exact same class DRF uses
        validated = auth.get_validated_token(token)    # inherited from simplejwt, unmodified
        return auth.get_user(validated)                # custom Users lookup + suspended/banned check
```

Hard requirement: **reuse `authentication.extensions.authentication.AppJWTAuthentication`
verbatim.** Do not call `jwt.decode`, do not instantiate `AccessToken` directly.
`get_validated_token` applies `SIMPLE_JWT` signing key, algorithm, and expiry; `get_user`
(`authentication/extensions/authentication.py:16-36`) resolves the custom `Users` model *and*
enforces the `suspended`/`banned` block. Reimplementing it would silently let banned users into
chat.

Catch `(InvalidToken, AuthenticationFailed, TokenError)` -> anonymous.

`ChatConsumer.connect()`:
```
if not scope["user"].is_authenticated:  await self.close(code=4401); return
await self.accept(subprotocol="bearer")
await self.channel_layer.group_add(f"chat.user.{user.id.hex}", self.channel_name)
```
Per-thread authorization happens on `thread.subscribe`, not at connect.

**Token expiry mid-connection:** the socket is authenticated once at handshake. A 15-minute
access token means a long-lived socket outlives its token. Accepted for this pass. Mitigation:
the consumer re-checks `can_write` (a DB read of the user's `status`) on every `message.send`,
so a user banned mid-session cannot keep writing.

---

## 6. Frontend plan

### Routes — `FrontEnd/src/main.tsx`

Inside the existing `<Route element={<ProtectedRoute />}>` block (currently `main.tsx:58-99`):
```jsx
<Route path="/mensagens" element={<Mensagens />} />
<Route path="/mensagens/:threadId" element={<Mensagens />} />
```
Same component for both — master-detail. On `md+` the list and the conversation render side by
side; below `md`, `:threadId` present hides the list.

Also change `main.tsx:91-93`: `/admin/denuncias` currently renders
`<AdminPlaceholder title="Denúncias" />`. Replace with `<AdminDenuncias />` (new page). This is
the existing, already-linked sidebar slot (`components/AdminLayout.tsx:8`) — no nav changes
needed for admin.

Wrap `<AuthProvider>`'s children with `<ChatUnreadProvider>` so the badge is available on every
page.

### Component tree

```
FrontEnd/src/pages/Mensagens/
  Mensagens.tsx            page shell; owns the socket via useChatSocket(); routes threadId
  ThreadList.tsx           inbox column; GET /chat/threads/; re-sorts on thread.updated
  ThreadListItem.tsx       avatar initials, scope_label, last message preview, unread pill
  ThreadView.tsx           header (peer name + scope_label + link to rental/anúncio), scrollback, composer
  MessageBubble.tsx        own/peer variants; pending/failed/sent/read states; hidden placeholder;
                           "Denunciar" action in a radix dropdown on peer messages
  MessageComposer.tsx      textarea, 4000-char counter, Enter=send / Shift+Enter=newline, typing throttle
  ReportMessageDialog.tsx  shadcn Dialog + reason textarea (mirror the reject dialog in pages/Admin/Anuncios.tsx)
  EmptyState.tsx           "Nenhuma conversa ainda."
FrontEnd/src/pages/Admin/Denuncias.tsx    queue table, mirrors pages/Admin/Anuncios.tsx structure
```
Use `components/ui/table.tsx`, `dialog.tsx`, `button.tsx`, `MaterialIcon`, `toast` from
`sonner`, and `framer-motion` for bubble entry — all already in the repo. Text in Portuguese.
Follow the design-token class names used across `pages/Admin/Anuncios.tsx`
(`bg-surface-container-low`, `text-on-surface-variant`, `border-outline-variant/30`), not raw
Tailwind colours.

### Service module — matches the `OperatorDocumentService` folder shape

```
FrontEnd/src/services/ChatService/
  ChatService.ts                        class + `export const chatService = new ChatService()`
  errors/ChatError.ts                   const-object error enum + ChatServiceError class,
                                        exactly like services/AdminService/AdminPostingService.ts:4-17
  models/ChatMessage.ts
  models/ChatThread.ts
  models/ChatUser.ts
  models/ResolveThreadRequest.ts
  models/SendMessageRequest.ts
  models/MessagePage.ts
  models/UnreadCounts.ts
  models/AdminMessageReport.ts
```
All calls go through `AxiosInstance` (`services/AxiosInstance.ts`) so the Bearer header and the
401->refresh retry (`AxiosInstance.ts:31-57`) come for free. The repo is inconsistent about
leading slashes (`ReviewService.ts:17` uses `/reviews/`, `AdminPostingService.ts:26` uses
`admin/postings/`). Pick **no leading slash** for ChatService, matching `AdminPostingService`,
since `baseURL` already ends in `api/`.

Methods: `resolveThread`, `listThreads`, `listMessages(threadId,
{before,before_id,after,after_id,limit})`, `sendMessage`, `markRead`, `getUnread`,
`reportMessage`, and admin: `listFlagged`, `resolveFlagged`.

`threadId` is `encodeURIComponent`-ed inside the service, never by callers.

### WebSocket hook — `FrontEnd/src/hooks/useChatSocket.ts`

New `src/hooks/` directory (none exists yet; keeps `contexts/` for React context only).

```ts
useChatSocket({ onMessage, onRead, onHidden, onTyping, onUnread, onThreadUpdated })
  -> { status: "connecting"|"open"|"closed", subscribe(threadId), unsubscribe(threadId),
       send(threadId, content, clientId), sendRead(threadId, upTo), sendTyping(threadId, isTyping) }
```

Behaviour, exactly:
1. **Token source.** Reads `tokens.access` from `useAuth()`. Does not connect while `isLoading`
   or `!isAuthenticated`. Reconnects when `tokens.access` changes identity.
2. **Connect.** `new WebSocket(wsUrl, ["bearer", token])`.
3. **Backoff.** On close with a code other than `1000`: delay =
   `min(30000, 1000 * 2 ** attempt)` with +/-20% jitter; `attempt` resets to 0 on a successful
   `open` that stays open >= 5 s. Never reconnect on `4403`. On `4401`, call
   `AxiosInstance.post("login/refresh")` once (this also refreshes the axios token via
   `setAccessToken`), then retry immediately; a second `4401` calls `logout()`.
4. **Resubscribe.** Keep a `Set<string>` of desired thread ids in a ref. On every `open`, replay
   `thread.subscribe` for the whole set.
5. **Catch-up after reconnect.** For each subscribed thread, if a `lastKnownMessage` exists in
   the store, call `chatService.listMessages(threadId, { after: last.sent_at, after_id: last.id,
   limit: 200 })` and merge ascending; loop while `has_more`. Then `chatService.getUnread()` and
   push into `ChatUnreadContext`. If no `lastKnownMessage`, do a normal first page instead.
   **This REST catch-up, not WS replay, is the only mechanism guaranteeing no lost messages** —
   the channel layer has no history.
6. **Heartbeat.** `{"type":"ping"}` every 25 s while `open`; if no frame at all is received for
   60 s, force-close and let backoff reconnect.
7. **Visibility.** On `document.visibilitychange` -> visible: if socket is not `open`, reset
   backoff and reconnect immediately; then run the catch-up in step 5.
8. **StrictMode.** `main.tsx:36` wraps in `<StrictMode>`, so effects run twice in dev. Guard the
   socket with a ref (the pattern already used at `AuthContext.tsx:56-58` with
   `hasBootstrapped`) and close cleanly in the cleanup function.

### Unread badge

`FrontEnd/src/contexts/ChatUnreadContext.tsx` —
`{ unreadTotal, unreadThreads, setUnread, refresh }`. Seeded by `GET /api/chat/unread` on mount
(only when authenticated); updated by `unread.updated` frames.

Wire into `FrontEnd/src/components/Navbar.tsx:51-52`, between `<ThemeToggle />` and the avatar
dropdown, rendered only when `isAuthenticated`:
```jsx
<Link to="/mensagens" className="relative">
  <MaterialIcon icon="chat_bubble" size={24} />
  {unreadTotal > 0 && <span className="absolute -top-1 -right-1">{unreadTotal > 9 ? "9+" : unreadTotal}</span>}
</Link>
```
Copy the badge markup verbatim from `components/NotificationPopover.tsx:36-39` so it visually
matches the existing notifications bell. `Navbar` is imported by 16 pages, so this is global
coverage with one edit.

### Entry points into chat

- `FrontEnd/src/pages/AnuncioDetalhe.tsx` — "Conversar com o locador" button ->
  `chatService.resolveThread({scope:"posting", scope_id: id})` ->
  `navigate('/mensagens/' + encodeURIComponent(thread.thread_id))`. Shown only when
  authenticated and the posting is not the viewer's own. **The frontend does not need the
  owner's user id** — that is why `resolve` exists; `PostingDetailSerializer`
  (`BackEnd/postings/serializer.py:121-140`) deliberately does not expose it and must not be
  changed.
- `FrontEnd/src/pages/AnaliseLocacao.tsx` and the two dashboards — "Mensagens da locação" ->
  `resolveThread({scope:"rental", scope_id: rentalId})`.

### Optimistic send UX

1. `clientId = crypto.randomUUID()`; append a bubble with `status: "pending"` (60% opacity, no
   timestamp, small spinner) and optimistically bump the thread to the top of the list.
2. If socket is `open` -> `message.send`; else -> `chatService.sendMessage()` (same `client_id`,
   so a later WS retry cannot duplicate).
3. On `message.new` with a matching `client_id` -> replace the pending bubble with the server
   object, `status: "sent"`.
4. No echo within 10 s -> `status: "failed"`, show a "Reenviar" affordance that reuses the
   **same** `client_id`.
5. Peer's `message.read` -> single check becomes double check.
6. Composer clears immediately on step 1; failures never eat the text (it lives in the failed
   bubble).
7. Dedupe rule for the store: key by `id`; a pending entry keyed by `client_id` is replaced when
   a message with the same `client_id` arrives.

---

## 7. Infra plan

### 7.1 Dependency versions — verified

| Package | Pin | Verification |
|---|---|---|
| `channels` | `4.3.2` | PyPI metadata carries `Framework :: Django :: 6.0`; requires `Django>=4.2`, `asgiref<4,>=3.9.0`. Repo pins `asgiref==3.11.1` — compatible. |
| `channels_redis` | `4.3.0` | requires `channels>=4.2.2`, `asgiref<4,>=3.9.1`, `msgpack~=1.0` (repo has `msgpack==1.2.1`), `redis>=4.6`. |
| `daphne` | `4.2.3` | requires `asgiref<4,>=3.5.2`, `autobahn>=22.4.2`, `twisted[tls]>=22.4`. |
| `redis` (client) | **`7.4.1` — do NOT use 8.x** | redis-py 8.0.0 breaks Django Channels with `Timeout reading from redis:6379` (redis/redis-py#4091, still open). channels_redis 4.3.0 is CI-tested against redis-py 4.6 and 5.0 only. |

Add to `BackEnd/docs/requirements.txt` (a pip freeze, roughly alphabetical), then re-freeze so
the transitives — `autobahn`, `Twisted`, `txaio`, `constantly`, `incremental`, `hyperlink`,
`Automat`, `service-identity`, `pyOpenSSL`, `attrs`, `zope.interface` — get pinned too. Do not
hand-write the transitives.

> **Do not confuse the client pin with the server image.** Redis *server* 8 is fine; it is the
> *Python client* 8.x that breaks. Use server image `redis:7.4-alpine`.

### 7.2 `compose.yaml`

Add a service between `db` and `backend`:
```yaml
  redis:
    image: redis:7.4-alpine
    command: ["redis-server", "--save", "", "--appendonly", "no"]
    ports:
      - "${REDIS_PORT:-6379}:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 12
```
No volume — the channel layer is ephemeral by design.

In `backend` (`compose.yaml:18-42`):
- `environment:` add `REDIS_URL: redis://redis:6379/0`
- `depends_on:` add
  ```yaml
      redis:
        condition: service_healthy
  ```

In `frontend` (`compose.yaml:48-50`), add
`VITE_WS_BASE_URL: ${VITE_WS_BASE_URL:-ws://localhost:8000}`.

### 7.3 `.env.example`

```
REDIS_PORT=6379
REDIS_URL=redis://localhost:6379/0
VITE_WS_BASE_URL=ws://localhost:8000
# Palavras bloqueadas na moderação do chat, separadas por vírgula. Vazio usa a lista padrão.
CHAT_BANNED_WORDS=
```

### 7.4 `BackEnd/djangoapi/settings.py`

`INSTALLED_APPS` (replacing lines 43-61) — **`daphne` must be the first entry**, before
`django.contrib.staticfiles`, because both override the `runserver` command and the first one
wins:
```python
INSTALLED_APPS = [
    'daphne',                    # antes de staticfiles: substitui o runserver por um servidor ASGI
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'channels',
    'rest_framework',
    'corsheaders',
    'api',
    'contracts',
    'users',
    'authentication',
    'postings',
    'machines',
    'administration',
    'document_validation',
    'chat',
    'drf_spectacular',
]
```

After `WSGI_APPLICATION` (line 103) — keep WSGI defined, add:
```python
ASGI_APPLICATION = 'djangoapi.asgi.application'

REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')

# Channels usa o Redis apenas como barramento efêmero entre processos ASGI.
# O Postgres continua sendo a única fonte de verdade das mensagens.
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {'hosts': [REDIS_URL], 'capacity': 1000, 'expiry': 10},
    }
}
```

Add near the contract settings (after line 252):
```python
# Moderação do chat: mensagens com estas palavras entram na fila da moderação,
# mas continuam sendo entregues (flag suave, não bloqueio).
CHAT_BANNED_WORDS = [
    w.strip().lower() for w in os.getenv('CHAT_BANNED_WORDS', '').split(',') if w.strip()
]
CHAT_MAX_MESSAGE_LENGTH = int(os.getenv('CHAT_MAX_MESSAGE_LENGTH', '4000'))
CHAT_RATE_LIMIT_MESSAGES = int(os.getenv('CHAT_RATE_LIMIT_MESSAGES', '20'))
CHAT_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv('CHAT_RATE_LIMIT_WINDOW_SECONDS', '10'))
```

`SPECTACULAR_SETTINGS['TAGS']` (line 154-164) — add after `'Avaliações'`:
```python
{'name': 'Mensagens', 'description': 'Chat entre locadores, locatários e operadores.'},
```

**Celery/RabbitMQ seam:** none of the above touches a broker. When async jobs arrive later, they
get their own `CELERY_BROKER_URL` and their own compose service; `CHANNEL_LAYERS` stays on
Redis. Do not add `CELERY_*` settings now.

### 7.5 `BackEnd/djangoapi/asgi.py`

Replace lines 10-16. Ordering matters — `get_asgi_application()` must run before anything that
imports models:
```python
import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'djangoapi.settings')

# Precisa vir antes de qualquer import que toque em models: é aqui que o
# Django carrega os apps.
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter   # noqa: E402
from channels.security.websocket import OriginValidator      # noqa: E402
from django.conf import settings                             # noqa: E402

from chat.middleware import JWTAuthMiddleware                # noqa: E402
from chat.routing import websocket_urlpatterns               # noqa: E402

application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': OriginValidator(
        JWTAuthMiddleware(URLRouter(websocket_urlpatterns)),
        settings.CORS_ALLOWED_ORIGINS,
    ),
})
```
`OriginValidator` against `CORS_ALLOWED_ORIGINS` (`settings.py:76-81`) rather than
`AllowedHostsOriginValidator`: the frontend runs on `:5173` while `ALLOWED_HOSTS` is
`localhost,127.0.0.1`, and `CORS_ALLOWED_ORIGINS` is already the list that describes "which
browser origins may talk to us".

### 7.6 `Devops/docker/backend/entrypoint.sh`

With `daphne` first in `INSTALLED_APPS`, `manage.py runserver` **is** a Daphne ASGI server and
keeps autoreload — which the bind mount at `compose.yaml:38` depends on. So dev stays as-is; add
only a production switch:
```sh
#!/bin/sh
set -eu

python manage.py migrate --noinput

# Em dev, `runserver` já é ASGI (o app `daphne` substitui o comando) e mantém o
# autoreload que o bind mount espera. Em produção, Daphne direto.
if [ "${DJANGO_SERVER_MODE:-dev}" = "asgi" ]; then
    exec daphne -b 0.0.0.0 -p 8000 djangoapi.asgi:application
fi

exec python manage.py runserver 0.0.0.0:8000
```
No `Dockerfile` change is needed — the new deps come in through `requirements.txt` at
`Devops/docker/backend/Dockerfile:14-18`, and port 8000 already carries both HTTP and WS.

### 7.7 `Devops/README.md`

Add Redis to the services table (`Devops/README.md:12-17`) and a line noting that WebSockets are
served on the same port at `ws://localhost:8000/ws/chat`.

---

## 8. Testing

`BackEnd/chat/tests.py` — Django `TestCase`, matching `BackEnd/postings/tests.py` (`setUp`
builds `Users`/`Machines`/`Postings` with explicit `uuid.uuid4()`; assertions on
`response.json()`).

Required cases:
1. **Thread key round-trip** — `format` then `parse` is identity; participant order is
   normalized regardless of input order.
2. **CheckConstraint** — creating a message with both `rental` and `posting` set, and with
   neither, raises `IntegrityError`.
3. **Idempotency** — two POSTs with the same `client_id` -> one row, second returns 200 with the
   same `id`.
4. **Authz matrix** — for each of {lessee, lessor, operator, unrelated locatário, admin} x
   {rental thread, posting thread} x {read, write}, assert the exact status code from §5.
5. **Owner cannot open a posting inquiry** (403), inquirer can, and once open the owner can
   reply.
6. **Inactive posting** blocks a new inquiry but not an existing thread.
7. **Inbox derivation** — a user with a rental thread and two posting threads gets exactly 3
   rows, correctly ordered, with correct `unread_count`, and the rental+operator case produces
   two distinct rental threads.
8. **Keyset pagination** — 120 messages, `limit=50`, walk `before`/`before_id` to exhaustion
   with no gaps and no repeats; then `after`/`after_id` returns the complement.
9. **Read receipts** — marking read only touches rows where the caller is receiver;
   `unread_total` drops accordingly; idempotent on re-call.
10. **Banned word** sets `flagged_for_moderation` but the message is still returned in the
    thread.
11. **Report** -> 200, second report by the same user -> 409, report by a non-participant -> 403.
12. **Admin queue** lists it; `resolve` with `hide` sets `hidden_at`, and the thread endpoint
    then returns `content: null, hidden: true` for participants and the real content for admins.

Consumer tests use `channels.testing.WebsocketCommunicator` with
`@override_settings(CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}})`,
`TransactionTestCase` (not `TestCase` — async tests touching the DB deadlock inside `TestCase`'s
atomic wrapper), `async def test_*`, and `database_sync_to_async` for fixtures. Cover: connect
with a valid subprotocol succeeds and echoes `subprotocol == "bearer"`; missing/expired token ->
close code 4401; subscribe to a forbidden thread -> `error` frame with `code: "forbidden"` and
the socket stays open; `message.send` reaches a second communicator subscribed to the same
thread with `client_id` intact.

drf-spectacular: every view gets `@extend_schema(tags=['Mensagens'], summary=, description=,
parameters=[], responses={})` following `BackEnd/api/views.py:27-66`. Declare explicit response
serializers for the hand-rolled envelopes (`ThreadPageSerializer`, `MessagePageSerializer`,
`UnreadCountsSerializer`) in `chat/serializer.py` — plain `serializers.Serializer` subclasses,
same technique as `BackEnd/api/schemas.py`. Verify with
`python manage.py spectacular --fail-on-warn`.

The WebSocket contract cannot be expressed in OpenAPI. Put §3.3 verbatim in the module docstring
of `BackEnd/chat/consumers.py`.

---

## 9. Derived threads vs. a `conversations` table

**Verdict: derived threads are workable. Ship them.**

### What the derived-thread inbox actually costs

`chat/selectors.py::inbox_page(user_id, limit, offset, scope=None)` — one raw SQL statement,
because Django's ORM cannot express "latest row per derived group" without `contrib.postgres`
aggregates and awkward ordering hacks:

```sql
WITH mine AS (
    SELECT m.id, m.sender_id, m.receiver_id, m.rental_id, m.posting_id,
           m.content, m.sent_at, m.read_at, m.hidden_at, m.flagged_for_moderation, m.client_id,
           CASE WHEN m.rental_id IS NOT NULL THEN 'rental' ELSE 'posting' END AS scope,
           COALESCE(m.rental_id, m.posting_id)      AS scope_id,
           LEAST(m.sender_id, m.receiver_id)        AS peer_lo,
           GREATEST(m.sender_id, m.receiver_id)     AS peer_hi
    FROM messages m
    WHERE m.sender_id = %(me)s OR m.receiver_id = %(me)s
),
agg AS (
    SELECT scope, scope_id, peer_lo, peer_hi,
           MAX(sent_at) AS last_sent_at,
           COUNT(*) FILTER (WHERE receiver_id = %(me)s AND read_at IS NULL) AS unread_count
    FROM mine
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
LIMIT %(limit)s OFFSET %(offset)s;
```

Then a second, plain-ORM pass hydrates `peer` names and `scope_label` with two `IN` queries
(`Users.objects.filter(id__in=)`,
`Rentals.objects.filter(id__in=).select_related('postings__machinery')`,
`Postings.objects.filter(id__in=).select_related('machinery')`). Three queries total, no N+1.

Honest accounting:
- `LEAST`/`GREATEST` on `uuid` columns is index-unfriendly; the `mine` CTE is an index scan on
  `idx_messages_sender_recent` union `idx_messages_receiver_recent`, then a full aggregation over
  **every message the user has ever sent or received**. There is no way to page the inbox without
  materializing the whole set.
- Practical ceiling: fine to roughly 10^4 messages per user (single-digit ms). Noticeable at
  10^5. Unacceptable at 10^6.
- Raw SQL means the query is invisible to the ORM's schema-change safety net. Isolating it in
  `selectors.py` is the mitigation.
- One behavioural consequence to accept explicitly: **rental threads are pairwise.** A rental
  with an assigned operator yields *two* threads for the lessee (<-> lessor, <-> operator), not
  one three-way room. This falls out of `(scope, scope_id, peer_lo, peer_hi)` and is the right
  product behaviour anyway, but the UI must not imply a group chat.

### Trigger for switching to `conversations`

Adopt a `conversations` table when either (a) p95 of `GET /api/chat/threads/` exceeds 300 ms, or
(b) any single user crosses ~50 000 messages. The migration path is non-destructive: create the
table, backfill from the same `GROUP BY` above, add `messages.conversation_id`, backfill, then
swap `selectors.py`. The REST contract in §3 does not change except that `thread_id` becomes a
bare UUID — which is exactly why the frontend is forbidden from parsing `thread_id`.
**Keep that rule.**

---

## 10. Trade-offs weighed and rejected

**Two sockets (inbox + per-thread) vs. one multiplexed socket.** Rejected: doubles the reconnect
logic, the auth handshakes, and the token-expiry surface. One socket at `/ws/chat` with
`thread.subscribe`/`thread.unsubscribe` costs one extra frame type and removes a class of bug.

**Opaque UUIDv5 `thread_id` vs. parseable composite key.** Rejected: a `uuid5` is one-way.
Resolving it back to a query requires a lookup table — the `conversations` table the user
declined. Mitigated by forbidding the frontend to parse it.

**Extra columns on `messages` vs. a `message_reports` table.** Rejected: four mostly-null columns
on the hottest table, no history (a second reporter overwrites the first), and no record of which
admin decided what.

**Query-param JWT for the WebSocket vs. subprotocol.** Rejected — it writes a live bearer token
into every access log in the request path, on every reconnect.

**Adding `DEFAULT_PAGINATION_CLASS` globally vs. hand-rolled pagination in chat views.**
Rejected: `REST_FRAMEWORK` (`settings.py:109-116`) has no pagination today, so every existing
endpoint returns a bare array; turning it on would silently change the response shape of
`reviews_list`, `rentals_list`, and the postings endpoints.

---

## 11. Work split — three parallel streams

### Stream A — Backend (Django, no infra, no frontend)

**Owns exclusively:**
```
BackEnd/chat/**                                (all files)
BackEnd/api/models.py                          (delete Messages)
BackEnd/api/migrations/0004_move_messages_to_chat_app.py
BackEnd/djangoapi/urls.py                      (one added line)
BackEnd/administration/views.py
BackEnd/administration/urls.py
BackEnd/administration/serializer.py
BackEnd/administration/permissions.py          (new)
Database/schema.sql
```
**Must NOT touch:** `BackEnd/djangoapi/settings.py`, `BackEnd/djangoapi/asgi.py`,
`BackEnd/docs/requirements.txt`, `compose.yaml`, `.env.example`, anything under `Devops/`,
anything under `FrontEnd/`.

### Stream B — Frontend (React, nothing under `BackEnd/`)

**Owns exclusively:**
```
FrontEnd/src/pages/Mensagens/**                (new)
FrontEnd/src/pages/Admin/Denuncias.tsx         (new)
FrontEnd/src/services/ChatService/**           (new)
FrontEnd/src/hooks/**                          (new)
FrontEnd/src/contexts/ChatUnreadContext.tsx    (new)
FrontEnd/src/main.tsx
FrontEnd/src/components/Navbar.tsx
FrontEnd/src/pages/AnuncioDetalhe.tsx
FrontEnd/src/pages/AnaliseLocacao.tsx
```
**Must NOT touch:** anything under `BackEnd/`, `Database/`, `Devops/`, `compose.yaml`,
`.env.example`, `FrontEnd/src/contexts/AuthContext.tsx`, `FrontEnd/src/services/AxiosInstance.ts`,
`FrontEnd/src/components/ProtectedRoute.tsx`.

Builds against §3 with a local stub module returning canned `ChatThread`/`ChatMessage` objects,
deleted before merge. Does not wait for the backend.

### Stream C — Infra / DevOps

**Owns exclusively:**
```
compose.yaml
.env.example
Devops/README.md
Devops/docker/backend/entrypoint.sh
BackEnd/docs/requirements.txt
BackEnd/djangoapi/settings.py
BackEnd/djangoapi/asgi.py
```
**Must NOT touch:** anything under `BackEnd/chat/`, `BackEnd/administration/`, `BackEnd/api/`,
`Database/`, `FrontEnd/`.

### Shared-file ownership summary

| File | Sole owner | Why it is contentious |
|---|---|---|
| `BackEnd/djangoapi/settings.py` | **Infra** | Backend needs `'chat'` in `INSTALLED_APPS` and the spectacular tag; Infra adds both on Backend's behalf. |
| `BackEnd/djangoapi/asgi.py` | **Infra** | Imports Backend's modules. |
| `BackEnd/docs/requirements.txt` | **Infra** | Backend may install locally, never commit pins. |
| `BackEnd/chat/routing.py`, `chat/middleware.py` | **Backend** | Infra reads them, never edits them. |
| `FrontEnd/src/main.tsx` | **Frontend** | |
| `Database/schema.sql` | **Backend** | Infra does not run it (compose uses Django `migrate`). |

---

## 12. Top 3 things most likely to go wrong

1. **The subprotocol handshake.** If `ChatConsumer.connect()` calls bare `self.accept()` instead
   of `self.accept(subprotocol="bearer")`, every browser closes the socket instantly with a
   useless `1006` and no server-side error. It will look like a network problem and burn a day.
   Mitigation: make it the *first* consumer test written (assert `subprotocol == "bearer"` on the
   communicator's connect response).
2. **The redis-py 8.x trap.** Whoever regenerates `requirements.txt` with an unpinned `redis`
   gets 8.1.0 and the channel layer silently times out under load — messages just stop arriving.
   Mitigation: pin `redis==7.4.1` with an inline comment citing redis/redis-py#4091.
3. **Migration state drift between `api` and `chat`.** If the field set in
   `chat/migrations/0001_initial.py` does not exactly mirror `api/migrations/0001_initial.py:49-61`,
   Django generates a phantom `AlterField` that tries to rewrite the live `messages` table.
   Mitigation: A1 is its own commit whose acceptance criterion is
   `makemigrations --check --dry-run` exiting 0 *before* any of the `0002` changes are written.
   Do not combine A1 and A2.

Runners-up: the `LEAST`/`GREATEST` ordering must be uuid-typed (a `::text` cast makes it
collation-dependent and the two sides silently disagree on `thread_id`); and `<StrictMode>`
double-mounting the socket in dev, which will look like duplicate messages until the ref guard is
in place.

---
---

# PLAN v2 AMENDMENTS — BINDING, SUPERSEDES CONFLICTS ABOVE

The architect re-verified against the real repo and PyPI after v1 was issued. Where this
section conflicts with anything above, THIS SECTION WINS. Section 3 (the frozen API contract)
is UNCHANGED — do not re-read it looking for differences, there are none.

## A2-1. Django 6.0 `runserver` is still WSGI-only (verified against the 6.0 release notes)

So `'daphne'` first in INSTALLED_APPS is not a stylistic choice — it is the only thing that
makes WebSockets work in local dev at all. Confirmed, keep it.

## A2-2. THE ENV FILE IS `BackEnd/.env`, NOT THE REPO-ROOT `.env`

`BackEnd/djangoapi/settings.py:22` loads `BASE_DIR / '.env'`, i.e. **`BackEnd/.env`**. That file
ALREADY EXISTS and already populates `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`.
The repo-root `.env` is for docker compose only and is NOT read by Django.

Consequence: the local path is already ~90% wired. Do not create a second env file, and do not
pass DB env vars on the command line — they are already in `BackEnd/.env`. Just confirm its
`DB_HOST=localhost` / `DB_PORT=5432` and use it.

`BackEnd/.env` is gitignored and is owned by **Infra**. Backend must not edit it.

## A2-3. NEW: `CHANNEL_LAYER_BACKEND` switch — this is what unblocks local dev

Replaces the flat `CHANNEL_LAYERS` block in §7.4. Infra implements this in settings.py:

```python
CHANNEL_LAYER_BACKEND = os.getenv('CHANNEL_LAYER_BACKEND', 'redis').lower()

if CHANNEL_LAYER_BACKEND == 'memory':
    if not DEBUG:
        raise ImproperlyConfigured(
            'CHANNEL_LAYER_BACKEND=memory só é permitido com DJANGO_DEBUG=true.'
        )
    CHANNEL_LAYERS = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}
else:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {'hosts': [REDIS_URL], 'capacity': 1000, 'expiry': 10},
        }
    }
```
Add `from django.core.exceptions import ImproperlyConfigured` to the imports (settings.py:13-16).

Why: `runserver` serves every connection from ONE process, so `InMemoryChannelLayer` reaches
both browser tabs. The entire feature — two users, live delivery, read receipts, typing, unread
badge, moderation — is demoable with no Redis and no Docker. The `ImproperlyConfigured` guard
prevents this ever reaching production, where multi-worker fan-out would silently not happen.

Also add to `BackEnd/.env` (Infra): `CHANNEL_LAYER_BACKEND=memory`, `REDIS_URL=redis://localhost:6379/0`,
`CHAT_BANNED_WORDS=`.
Also add to root `.env.example` (Infra): `CHANNEL_LAYER_BACKEND=redis` with a comment that
`memory` is DEBUG-and-single-process only.
Also add to compose.yaml `backend.environment` (Infra): `CHANNEL_LAYER_BACKEND: redis`.

## A2-4. TIERED DEPENDENCY INSTALL — do not install more than you need

| Tier | Install | Unblocks |
|---|---|---|
| **1 (required)** | `channels==4.3.2` | The ENTIRE test suite including every consumer test. Pure Python, no compiled deps, lowest risk. |
| **2 (recommended)** | `daphne==4.2.3` | Live WebSockets in a browser, two-tab demo. Pulls Twisted + zope.interface. |
| **3 (optional)** | `channels_redis==4.3.0` + `redis==7.4.1` + a local Redis | Only closes the cross-process fan-out gap. Skip unless asked. |

**Tests need ONLY Tier 1.** `WebsocketCommunicator` + `InMemoryChannelLayer` require neither
`daphne` nor `channels_redis` nor Redis. Do not install Tier 3 or start a Redis service on the
user's machine unless explicitly asked.

**PYTHON VERSION SKEW — REPORT THIS.** The container is `python:3.13-slim`
(`Devops/docker/backend/Dockerfile:1`); the local venv is **Python 3.14.5**. Twisted 26.4.0
classifies only up to 3.13, though its one compiled dep (`zope.interface` 8.6) ships cp314
wheels, so daphne is *expected* to install on 3.14. **This is an expectation, not a verified
fact.** Infra must actually run the Tier 2 install and report the real result. If daphne fails
on 3.14: tests and all REST work are UNAFFECTED (Tier 1 only), only the browser demo is blocked,
and the fallback is a Python 3.13 venv matching the container. Do not silently substitute a
different version — report it.

## A2-5. TEST RUNNER: `manage.py test`. THERE IS NO PYTEST.

Verified: no `pytest` in requirements, no `pytest.ini`, no `conftest.py`, no `pyproject.toml`.
`BackEnd/postings/tests.py:7,17-18` uses `django.test.TestCase` + `@override_settings`.
**Do not introduce pytest.** Run `./venv/bin/python manage.py test chat` and
`./venv/bin/python manage.py test` for the full suite. `--keepdb` on repeat runs.
The `DB_USER` needs `CREATEDB` for Django to build `test_<DB_NAME>`.

## A2-6. Consumer test details that will otherwise cost an hour

```python
@override_settings(CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}})
class ChatConsumerTests(TransactionTestCase):
    ...
communicator = WebsocketCommunicator(
    application, "/ws/chat",
    subprotocols=["bearer", token],
    headers=[(b"origin", b"http://localhost:5173")],   # OriginValidator REQUIRES this
)
connected, subprotocol = await communicator.connect()
self.assertTrue(connected)
self.assertEqual(subprotocol, "bearer")   # guards the #1 integration bug
```
- **`TransactionTestCase`, never `TestCase`** — `TestCase`'s atomic wrapper deadlocks against
  async DB work via `database_sync_to_async`.
- Build against the real routed `djangoapi.asgi.application` so `JWTAuthMiddleware` AND
  `OriginValidator` are genuinely exercised.
- `OriginValidator` needs the `origin` header matching `CORS_ALLOWED_ORIGINS` (settings.py:77),
  or the connection is rejected and you will blame the JWT.
- Always `await communicator.disconnect()` in a `finally`, or the suite hangs.

## A2-7. NEW REQUIRED TEST CASE 13 + the rule it protects

`InMemoryChannelLayer` will happily pass a `UUID` or `datetime` object through `group_send`.
`channels_redis` msgpack-serializes it and BLOWS UP — a failure that appears only on Redis,
i.e. only in the container we cannot test.

**Rule:** `services.create_message` must build the fan-out payload from already-serialized
primitives — the exact `ChatMessage` dict from `serializer.py` — never model instances, never
raw `UUID`/`datetime`.

**Test case 13:** assert `json.dumps(payload)` succeeds on the fan-out payload. This catches most
of that failure class with no Redis present.

## A2-8. Frontend gains one owned file

`FrontEnd/.env.local` (gitignored, local dev) with:
```
VITE_API_BASE_URL=http://localhost:8000/api/
VITE_WS_BASE_URL=ws://localhost:8000
```

## A2-9. Honest coverage gaps — state these in the final report, do not paper over them

Not covered by any test or by the local single-process demo, and NOT verifiable this session:
1. Cross-process / cross-worker group fan-out — the entire reason `channels_redis` exists, and
   precisely what `InMemoryChannelLayer` cannot model.
2. `channels_redis` wire behaviour — msgpack serialization, `capacity` backpressure, `expiry` TTL.
   (Test 13 mitigates the most common case.)
3. `group_add`/`group_discard` durability across a Redis restart.
4. redis-py 7.4.1 ↔ channels_redis 4.3.0 interop — reasoned from release metadata and an upstream
   issue, not from a run on this machine.
5. Everything in §7.2, §7.6, §7.7 — the compose redis service, healthcheck, `depends_on` gating,
   the entrypoint `DJANGO_SERVER_MODE` branch, and the image build with the new pins.

First action once Docker is repaired: two backend workers, `CHANNEL_LAYER_BACKEND=redis`, two
browsers, confirm delivery both ways.
