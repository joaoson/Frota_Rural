# T01–T07 gap-closure implementation plan

Source: [FEATURE_AUDIT_T01_T07.md](FEATURE_AUDIT_T01_T07.md) (audit of `084a48c`). File and line references below were re-checked on **2026-10-21** against `develop_joaofre_locacoes_integradas` (HEAD `0470fa9` plus uncommitted work). Every P1/P2 defect in the audit is still present.

## 1. Scope decision: no hour-meter pricing

| Topic | Decision |
| --- | --- |
| Rental price | A fixed **daily price**: `diária = tarifa/hora × 8`, `subtotal = diária × diárias` (start and end day both count whole), `total = subtotal × 1,05` (platform fee). This is already the formula in `BackEnd/payments/pricing.py:20-26` and in the booking screen (`Reservar.tsx:575-582`). What changes is that the price is **frozen at booking** and is presented as the agreed price, not as an "estimate". |
| Hour meter (horímetro) | Initial/final readings are kept as **usage metrics only**. They never change `total_price`, never create a payment, refund or extra charge, and are not required for the owner to be paid. |
| T03 | **Descoped** as a charging feature. From the audit, these items are dropped: included-hours snapshot, excess formula, dispute/approval of hours, supplementary checkout for overage, overage notifications. These items stay: validated readings, an owner completion flow, and usage metrics (Phase 3). |
| Owner price suggestion | `BackEnd/pricing/` keeps using the machine's cumulative `hour_meter` as a wear input when it *suggests* an hourly rate. That isn't rental pricing: it only proposes a rate the owner can accept. Step 3.4 offers an option to refresh it from check-out readings. |

**Record the decision first** (Phase 0): add `Documentation/adr/0002-preco-por-diaria-e-horimetro-informativo.md` (same Portuguese format as ADR 0001), and change the audit's T03 row to "Descoped → usage metrics". If T03 is a graded item in the BSI specification, get whoever accepts the project to confirm the descoping.

## 2. Defaults assumed for the open business questions

The audit left these to the product owner. The plan uses the defaults below. Each one is isolated in a single policy module, so changing it later is a small edit.

| Question | Default in this plan | Used in |
| --- | --- | --- |
| What is the "calção"? | There is no refundable deposit. Checkout is full prepayment of the fixed price. | 2.2 |
| Cancellation of an unpaid booking | Free for the tenant or the owner. An open Stripe Checkout is expired first. | 2.2 |
| Tenant cancels a paid booking ≥ 7 days before start | 100% refund. | 2.2 |
| Tenant cancels a paid booking < 7 days before start | 90% refund. The 10% retention matches the existing "Multa de 10%" in clause 9. | 2.2 |
| Owner cancels a paid booking | 100% refund to the tenant. | 2.2 |
| After the start date | No self-service cancellation (admin only). | 2.2 |
| Date release on cancellation | Dates are released immediately. The refund is tracked separately. | 2.2 |
| Signature deadline (clause 9.2) | Both signatures are due 24 h before start. If missed, the booking is cancelled automatically with a 100% refund. | 2.3 |
| Minimum notice (lead time) | One server constant, **7 days** (today's UI rule), applied to single bookings, date changes and every recurrence occurrence. | 4.3 |
| Who may book | Role `locatario` or `admin`, and never the machine owner. | 4.3 |
| Who records meter readings | The owner (locador). The tenant and the operator can see them. Readings are optional for completion. | 3.1 |
| Completion preconditions | Both signatures present (`signed`) and the end date reached. | 1.4, 3.2 |
| Amendments | A date shift that keeps the same number of diárias, so the price is unchanged and no money moves. An extension stays a new booking (the existing "Reservar próximo período" flow). Shortening a booking is not supported. | 2.4 |

## 3. Phase overview

| Phase | Goal | Depends on | Size |
| --- | --- | --- | --- |
| 0 | Record the scope decision (ADR, audit note) | — | S |
| 1 | Protect agreed records: price snapshot, immutable contract revisions, stale-view guard, OTP/IP evidence, meter validation, honest contract text | 0 | L |
| 2 | T02 contract management: durable payment attempts, cancellation and refund, signature deadline, date-change amendments | 1.1, 1.2 | L |
| 3 | Hour meter as usage metrics (replaces T03): reading commands, completion flow, metrics UI | 1.4, 4.2 | M |
| 4 | Reliability and consistency: chat fixes, shared lifecycle meaning, one booking policy, booking notes | chat: none | M |
| 5 | Ongoing use: recurrence series, reminders, pagination, hardening | — | — |

Chat (4.1) can start right away, in parallel with everything else. Phase 3 is now small and independent of payments, so it can run in parallel with Phase 2 once 1.4 and 4.2 land. That also gives owners the missing "finish rental" flow early.

---

## Phase 1 — Protect agreed records

### 1.1 Freeze the agreed price (audit P1 #1)

**Problem.** `RentalService.update` (`BackEnd/rentals/services.py:119-125`) reprices whenever the payload contains `postings`, even when the posting is unchanged and the rental is paid, signed or completed. Checkout also recomputes from the live listing rate (`payments/services.py:73`). The contract builds its values from the live `posting.hourly_rate` (`contracts/contract_document.py:163-183`).

**Changes**
- `BackEnd/payments/pricing.py`: add a frozen `Cotacao` dataclass (`tarifa_hora`, `horas_por_diaria`, `valor_diaria`, `diarias`, `subtotal`, `taxa_percentual`, `taxa_valor`, `total`) and `cotar(posting, inicio, fim)`. `calcular_total` becomes a thin wrapper. Make `HORAS_POR_DIARIA` the single source: `contract_document.HORAS_ESTIMADAS_POR_DIA` duplicates it.
- `BackEnd/rentals/models.py` + migration: snapshot columns `hourly_rate_snapshot`, `daily_rate`, `billable_days`, `subtotal`, `platform_fee_rate`, `platform_fee`, `priced_at`. Backfill existing rows from the agreed amount (the approved payment amount, otherwise `total_price`): `subtotal = total / 1,05`, `daily_rate = subtotal / days`, `hourly_rate_snapshot = daily_rate / 8`.
- `RentalService.create` stores the quote. `RentalService.update` reprices only when `start_date`/`end_date` **actually change** (compare values, not key presence) in the editable state, and `postings` no longer triggers a reprice. Remove `total_price` from `RentalInputSerializer.Meta.fields` (`rentals/serializer.py:46-56`).
- `PaymentService.create_checkout` charges `rental.total_price`. It re-quotes only while the rental is unpaid **and** its hold has lapsed (`reservation_expires_at <= now`), and it returns the amount so the UI can warn about a change.
- `BackEnd/api/recurrence.py:113`: each occurrence stores its own quote through `cotar`.
- New read-only `GET /api/postings/<id>/quote?start=&end=` returns the `Cotacao`. `Reservar.tsx` displays it instead of re-implementing `HORAS_POR_DIARIA`/`TAXA_PLATAFORMA` (`Reservar.tsx:17-19,575-582`).
- `contract_document.py` reads the snapshot, not the listing.

**Acceptance tests**
- Audit reproduction: a paid rental at R$180/h, listing changed to R$300/h, PATCH and PUT with the same `postings` → `total_price` stays 3024,00. Run it for `awaiting_payment`, `active`, `signed` and `completed`.
- Listing rate changes during the hold → checkout charges the snapshot. After the hold lapses → a re-quote and the new amount is returned.
- Recurrence occurrences keep their own quotes. A migration test covers the backfill (PostgreSQL upgrade path).

### 1.2 Immutable contract revisions, signed as one document (audit P1 #2)

**Problem.** Every view rebuilds the document from live profile, listing and rental data (`contract_document.py:155-213`). Signing hashes whatever is current (`contracts/services.py:305-307`). The contract becomes `signed` from two booleans, even when the two parties accepted different hashes (`:332-340`). The clause text lives only in React (`Contrato.tsx`), outside the hash.

**Changes**
- New `ContractRevisions` model in `BackEnd/contracts/models.py`: `contract`, `number` (unique per contract), `document` (JSON: the full canonical document **including clause text**), `document_hash`, `template_version`, `reason` (`initial` / `amendment`) and `created_at`. It is append-only, with the same `save`/`delete` guard as `ContractSignatures` plus an UPDATE/DELETE trigger migration that copies the pattern of `api/migrations/0002`.
- `Contracts.current_revision` FK (nullable for legacy contracts).
- **Freeze point:** `PaymentService._approve` (`payments/services.py:176-181`) freezes revision 1 in the same transaction, since signing already requires payment. Before payment, `get_document` returns a live preview labelled "prévia".
- **Clause content moves to the backend:** a structured template `BackEnd/contracts/templates/locacao_v2.py` (clause → title → items with placeholders, plus typed blocks for the price grid and the penalty grid) is rendered into the document. `Contrato.tsx` renders `document.clausulas` generically while keeping today's styling. `DOCUMENT_VERSION` becomes `2.0.0`.
- `ContractSignatures.revision` FK, plus a unique constraint on (`revision`, `role`).
- `ContractSignInputSerializer` and `ContractOtpRequestInputSerializer` require `revision_id`. Check it **before** consuming the OTP and again under the lock in `_record_acceptance`. A mismatch returns `Conflict(code="stale_revision")`. Sign `revision.document` without rebuilding it. The contract becomes `signed` only when both roles have a signature on `current_revision`.
- `get_document` / `get_evidence` (`contracts/services.py:88-129`) serve the frozen revision. `verify_chain` checks each signature against its own revision. A legacy contract without a revision keeps today's behaviour and is flagged "documento legado".
- Frontend: `ContractRepository.sign` / `requestSignatureOtp` (`ContractRepository.ts:146-170`) send `revision_id`. On `stale_revision` the page reloads and shows "O contrato foi atualizado. Revise antes de assinar." The sign response also returns the rental status, which removes the extra `findRentalById` call at `:159` (if that call fails today, the UI reports a failed signature even though the signature persisted).

**Acceptance tests**
- Audit reproduction: tenant signs → tenant edits their address → owner signs. Both signatures carry the same hash, the document still shows the old address, and `cadeia_integra=true`.
- Signing with a stale `revision_id` → 409, and the OTP is not consumed.
- Profile, listing or template edits after freezing leave existing revisions unchanged. The existing two-signer concurrency test still passes.

### 1.3 OTP bound to the verified address; trusted proxy IP (audit P2 #5)

- `ContractSignatureOtps`: add `signer` and `revision` FKs. `_consume_otp` (`contracts/services.py:348-380`) filters by contract, role, signer and revision, and rejects the code if `otp.email != signer.email`. When `otp_verified`, the evidence records `otp.email`.
- `UserService.update` (`BackEnd/users/services.py`): an email change expires every outstanding signature OTP for that user.
- `signature_evidence.client_ip` (`:47-53`): new setting `TRUSTED_PROXY_IPS` (env, empty by default). Read `X-Forwarded-For` only when `REMOTE_ADDR` is trusted, and take the right-most address that is not a trusted proxy. Document the value for the deploy ingress.
- Optional (audit "further improvements" #2): consume the OTP and record the acceptance in one transaction, while still committing wrong-attempt counts.

**Acceptance tests:** an old-email code used after an email change → 400. The evidence email is the verified address. A direct request with a spoofed XFF records `REMOTE_ADDR`. A trusted proxy chain records the real client.

### 1.4 Validate meter input now; fix completion guards (audit P1 #4, reduced)

- Remove `initial_hour_meter` / `final_hour_meter` from the generic PATCH (`rentals/serializer.py:53-54`, `services.py:105-107`). Phase 3 adds the dedicated command. If Phase 3 is not next, validate in the meantime instead: `0 ≤ value ≤ HOUR_METER_MAX` (reuse `machines/serializer.py:14`) and `final ≥ initial`.
- Completion (`rentals/services.py:94-99`) requires `status == signed` and `end_date <= now`. Readings are **not** required.

**Acceptance tests:** audit reproductions: negative or decreasing readings → 400; completing an `active` (unsigned) rental → 409.

### 1.5 Make the contract say what the product does (audit P2, clauses)

These edits go into the backend template from 1.2. Each wording change bumps the template version.
- **Clause 4 → "Preço e Pagamento".** The cards become *Tarifa/hora*, *Diária (8 h)*, *Diárias*, *Valor total*. The text says the price is fixed per diária (tarifa × 8 h), paid at confirmation, and that **there is no extra charge or refund based on hours used**.
- **Replace the horímetro box** (4.2, the check-in/check-out table, the "Valor final apurado = tarifa × horas informadas" row, and 4.3's "pagará a diferença diretamente ao Locador") with: the Locador records the reading at handover and return, for usage tracking only; readings do not change the price; invalid or decreasing readings are rejected.
- **3.2 / 5.4:** drop the mandatory photo promise (photos aren't implemented) and keep the inspection wording.
- **2.2 / 2.4 (extension/amendment) and 9.1 / 9.2 (cancellation, refund, signature deadline):** publish the final wording together with Phase 2. Until then, describe only what exists.
- Rename the document keys that say "estimate": `estimativa_horas` → `horas_por_diaria` + `diarias`, `valor_total_estimado` → `valor_total` (`contract_document.py:177-183`, `FrontEnd/src/features/contracts/types/contractDocument.ts`).
- A legal review of the final template is a separate task.

---

## Phase 2 — Contract management (T02)

### 2.1 Durable payment attempts and reconciliation (audit P2, prerequisite for refunds)

- `Payments`: make `session_id` nullable, and add `idempotency_key` (unique), `payment_intent_id`, `last_error` and a `creating` status.
- `create_checkout`: inside the booking lock, create the `creating` attempt with the key `checkout:{rental_id}:{attempt_no}` and commit. Then call `Session.create(..., idempotency_key=key, metadata={rental_id, payment_id})` and store the session. The hold (`reservation_expires_at`) protects the dates and the attempt row protects against duplicate sessions, so the Stripe call no longer needs to sit inside the row locks.
- `_approve` stores `session["payment_intent"]`, which refunds need.
- New `PaymentEvents` table (unique Stripe event ID, type, received/processed timestamps) to dedupe and trace webhooks.
- New management command `payments/management/commands/reconcile_payments.py`: it retries `creating` attempts by key or metadata, expires stale open sessions, retries `pending`/`failed` refunds (2.2) and lists `requires_review`. The repo has no scheduler, so run the command from a cron or scheduled container in `Devops/` and on demand.

**Acceptance tests:** provider accepted the request but the network failed → the retry produces one session and one row. A failure after remote creation but before the local save → reconcile links the session. Duplicate and out-of-order webhooks are handled.

### 2.2 Cancellation with refund (audit P1 #3)

- `BackEnd/rentals/policy.py`: `cancellation_quote(rental, actor, now)` returns `(allowed, refund_amount, retained_amount, reason_code)` and implements the defaults table. The policy version is snapshotted on the rental at booking.
- New `Refunds` model (`payment`, `amount`, status `pending/succeeded/failed/canceled`, `provider_refund_id`, unique `idempotency_key`, `reason`, `requested_by`, timestamps). `PaymentStatus` gains `refunded` and `partially_refunded` (`payments/enums.py`).
- `GET /api/rentals/<id>/cancellation` (preview of the refund amount and policy text) and `POST /api/rentals/<id>/cancel {reason}`.
- **Flow:** take the locks in today's order (posting → rental → contract → payment) → check the policy → if a checkout is open, `Session.expire` it; if that session already completed, return 409 "pagamento em confirmação" → mark the rental and contract `cancelled` and release the dates → create the `Refunds` row as `pending` → commit → `Refund.create(payment_intent, amount, idempotency_key)` → update the row. Failures stay `pending`/`failed` and `reconcile_payments` retries them **without touching the rental**, so a refund never runs twice and a booking never reopens.
- Webhooks: `refund.updated`, `refund.failed`, `charge.refunded`.
- A late payment on a cancelled rental (today `_approve` puts it in `requires_review`, `payments/services.py:168-175`) creates a full refund automatically.
- Retire status changes through the generic PATCH: `RentalService.update` rejects `status` with a 409 that points to `/cancel` or `/complete`. `ContractRepository.cancelRental` switches to the new endpoint.
- Notifications through `notifications/events.py`: `rental_cancelled` (with the actor), `refund_pending`, `refund_succeeded`, `refund_failed`.
- UI: `RentalCard.tsx:139` currently shows the cancel action only for `pending`. Show it whenever the preview allows cancellation, open a confirmation dialog with the refund amount and a reason field, and add the badges "Estorno em processamento / concluído / falhou".

**Acceptance tests:** cancellation while pending, with an open checkout, paid ≥ 7 days out, paid < 7 days out, by the owner, and after start (403). Also: a duplicate cancel request, a webhook replay, a timeout after the provider succeeded, a concurrent payment and cancellation, a refund failure followed by a retry. In every case the dates are released exactly once.

### 2.3 Signature deadline (clause 9.2)

- `Contracts.signature_deadline` is set when the revision is frozen (default: `start_date − 24 h`).
- Lazy enforcement, the same way holds work today: signing after the deadline returns 409. A management command, `expire_unsigned_contracts`, cancels the booking and issues a 100% refund through 2.2. It is idempotent.
- A reminder notification at deadline − 24 h (or move it to Phase 5).

### 2.4 Date-change amendments (T02 "request edits", audit P2 #5)

- New `ContractAmendments` model: `contract`, `proposer`, `base_revision`, `proposed_start` and `proposed_end`, `reason`, status `pending/accepted/rejected/withdrawn/expired`, `decided_by`/`decided_at`, `expires_at`. Only one pending amendment is allowed per contract.
- **Rule:** the same number of diárias, so the price is unchanged and no payment flow is needed.
- `POST /api/contracts/<id>/amendments` and `POST .../amendments/<aid>/accept|reject|withdraw`.
- **Accept:** take the booking lock order, then recheck availability (ignoring this rental) and the lead time. Update the dates, freeze a new revision (`reason="amendment"`) and reset both `accepted_by_*` flags; the contract returns to `pending_signatures` while the rental stays `active` (paid), and the signature deadline is recomputed. The original terms stay in force until the amendment is accepted.
- Notifications at every step. UI: "Solicitar alteração de datas" on the rental card and the contract page, and a banner for the counterpart showing old vs new dates with Accept/Reject.
- Extensions keep the existing new-booking flow (`AnaliseLocacao.tsx` "Reservar próximo período"), now with a persisted note (4.3) and an optional `extends_rental` link.

**Acceptance tests:** acceptance rechecks availability atomically (concurrent-booking test); rejection keeps the original dates; a stale `base_revision` → 409; both parties must sign the new revision; an amendment on a completed or cancelled rental → 409.

---

## Phase 3 — Hour meter as usage metrics (replaces T03)

### 3.1 Reading records and commands

- New `RentalMeterReadings` model: `rental`, `kind` (`check_in` / `check_out`), `value`, `recorded_by`, `recorded_at`, `note`, and a nullable `supersedes`. The latest reading per kind wins. `Rentals.initial_hour_meter` / `final_hour_meter` stay as the denormalized latest values, so the serializers, seed and tests keep working.
- `POST /api/rentals/<id>/meter-readings {kind, value, note}`:
  - Only the owner can record, and only on a `signed` rental.
  - `check_in` is allowed from the start day; `check_out` only after a check-in.
  - Values must satisfy `0 ≤ value ≤ 60000`, and `check_out ≥ check_in`.
  - Corrections are allowed until completion and are saved as superseding rows.
  - If `check_in` is below the machine's recorded `hour_meter`, show a warning but don't block.
- **Invariant:** nothing in `payments/` or `pricing/` reads rental readings. An explicit test asserts that recording or correcting readings leaves `total_price`, payments and refunds unchanged.
- An informational notification to the tenant: `meter_check_in_recorded` / `meter_check_out_recorded`.

### 3.2 Completion flow (closes the audit's "no completion UI" gap)

- `POST /api/rentals/<id>/complete`: owner only, `signed`, `end_date` reached. Readings are optional; the dialog asks for the check-out reading if it is missing. Completion emits `rental_completed`, which already unlocks reviews.
- `ContractRepository`: add `recordMeterReading`, `completeRental`.
- `RentalCard` owner actions: "Registrar check-in", "Registrar check-out", "Concluir locação" (driven by `allowed_actions` from 4.2).

### 3.3 Metrics

- `RentalOutputSerializer`: `hours_used` (final − initial, or null), `reference_hours` (8 × `billable_days`), `readings[]`.
- Machine usage for the owner dashboard (a new `GET /api/machines/<id>/usage` or a field on the machine list): days rented, hours used across completed rentals, average hours per diária, last reading.
- `AnaliseLocacao.tsx`: a new "Uso do equipamento" card (hours used, average per day, share of the 8 h/day reference), labelled **"Informativo — não altera o valor da locação"**.

### 3.4 Optional: keep the machine meter current

When a rental completes with a check-out reading above `machines.hour_meter`, update `hour_meter` and `hour_meter_updated_at`. This affects only future price **suggestions** for the owner, never a rental price. Decide whether to turn it on.

**Acceptance tests:** negative, decimal, > 60000 and decreasing values; the wrong role or the wrong status; a double submit; a correction; completion without readings (allowed); completion before both signatures (409); `total_price` and payments unchanged after readings; both-role UI walkthrough.

---

## Phase 4 — Reliability and consistency

### 4.1 Chat (audit P2 #6, can start immediately)

| Defect | Fix | Files |
| --- | --- | --- |
| Messages read while the thread is open stay unread | In `onMessage`, when the thread is open, the sender is the peer and `document.visibilityState === "visible"`, send a debounced read (`socket.sendRead` or `chat.markRead`) up to the latest message. Also mark read again when the tab becomes visible. | `FrontEnd/src/pages/messages/Mensagens.tsx:77-79` |
| History stops at 50 messages | Keep `hasMore` from the first page. Add "Carregar mensagens anteriores" with a `before`/`before_id` cursor from the oldest confirmed message and preserve the scroll anchor. Paginate the thread list too. | `Mensagens.tsx:116,144-148`, `ChatInboxPanel.tsx:25` |
| Reconnect misses the first messages of an empty thread | Track the last **confirmed** message (skip `pending-…` IDs). With no cursor, fetch the recent page. Catch errors and ignore stale responses through a generation counter tied to the thread. | `Mensagens.tsx:101-114` |
| A retried WS send never gets acknowledged | The backend sends the sender a `message.ack` with the canonical message for both new and replayed sends, and rejects a `client_id` reused with a different thread or content. The client replaces the optimistic row on ack. | `BackEnd/chat/consumers.py:137-141,181-190`, `chat/services.py:127-150`, `useChatSocket.ts` |
| The dashboard inbox goes stale | Extract a shared `useChatThreads` hook (pagination, `thread.updated` merge, refresh on reconnect) used by both `Mensagens` and `ChatInboxPanel`. | `ChatInboxPanel.tsx:23-37`, `ChatSocketContext.tsx` |
| WS `error` frames are ignored | Handle `type: "error"` correlated by `client_id`/`thread_id`: fail the send immediately with the server's message. `forbidden` makes the composer read-only; rate limits show a wait message. | `useChatSocket.ts:131-167` |

**Acceptance tests (audit):** two-browser live read receipts; 120 messages and 60 threads reachable; first message received while offline is recovered; a lost ack leaves one stored row and the retry succeeds; a rental cancelled while the chat is open explains the read-only state; the dashboard inbox updates without navigation.

### 4.2 One meaning for rental states

- `BackEnd/rentals/lifecycle.py` owns the status groups used today by `payments/availability.py:12-19`, `contracts/services.py:384`, the rental service and recurrence. It also derives a `phase`:

  | Phase | Condition |
  | --- | --- |
  | `reserva` | — |
  | `aguardando_pagamento` | — |
  | `aguardando_assinaturas` | `active` |
  | `pronta_para_entrega` | `signed`, before start |
  | `em_uso` | `signed`, started |
  | `devolvida` | check-out recorded |
  | `concluida` | — |
  | `cancelada` | — |

- `RentalOutputSerializer` exposes `phase` and `allowed_actions` (pay, cancel, sign, amend, record reading, complete, review). The UI stops hardcoding status lists.
- Frontend: `features/contracts/types/rentalLifecycle.ts` consumes them. Fix the "LOCAÇÕES ATIVAS" counter (`DashboardLocatario.tsx:250` counts only `active`) and align the owner dashboard (`DashboardLocador.tsx:225`). Remove the phantom `"validating"` status, which appears in the UI lists and `rentalBadges.ts:19` but not in `RentalStatus`.
- Add status-driven dashboard tests for both roles.

### 4.3 One booking policy, plus persisted notes

- `BackEnd/rentals/policy.py`: `ANTECEDENCIA_MINIMA_DIAS = 7`; the lessee's role must be `locatario` or `admin`; the lessee must not be the machine owner. Use it in `RentalService.create`, in date changes and amendment acceptance, and in `api/recurrence.py:70-123`. The occupancy or quote response exposes `min_start_date`, and `Reservar.tsx:394-398` reads it instead of computing it.
- Booking notes: `Rentals.notes` (`TextField`, max 1000), included in the create payload (`Reservar.tsx:660-665`) and shown to both parties. Notes are operational and are **not** part of the contract revision.
- Recurrence creates occurrences through the same reservation factory as single bookings, so pricing, policy and events can't drift.

**Acceptance tests:** start today, tomorrow, in 6 days and in 7 days, plus a timezone boundary, for both single and recurrence; owner self-booking → 403; operator role → 403; a note survives a reload and the owner can see it.

---

## Phase 5 — Ongoing use (from the audit, unchanged)

- A recurrence series view: grouped occurrences, paid/unpaid/expired counts, reopening after the dialog is closed, a policy for editing or cancelling future occurrences (reusing 2.2).
- An explicit hold-expiry state and reminders; notification events for refunds, amendments, readings and deadlines.
- OTP resend cooldown and throttling, and rejecting OTP requests on closed contracts.
- Server pagination for rental and contract lists, plus a prefetch of the reverse contract used by the rental serializer.
- An archival PDF generated from the frozen revision.
- A reachability review of the dependency audit findings recorded in `Devops/CI_CD.md`.

---

## 4. Suggested PR sequence

| # | PR | Steps | Depends on |
| --- | --- | --- | --- |
| A | ADR + price snapshot + meter validation (**implemented 2026-10-21**: readings stay writable by the owner through PATCH, now validated, until Phase 3; contract document keys keep their names until PR B so existing signature hashes still verify) | 0, 1.1, 1.4 | — |
| B | Contract revisions + backend clause template + honest text (**implemented 2026-10-21**: legacy 1.0.0 contracts keep their old wording and two-flag flow; the operator clauses 1.2/5.2 were left as they were) | 1.2, 1.5 | A |
| C | OTP binding + trusted proxy IP (**implemented 2026-10-21**: setting named `CONTRACT_TRUSTED_PROXIES`; a changed email is rejected at signing instead of invalidating codes in the profile update) | 1.3 | B (revision FK) |
| D | Chat reliability (**implemented 2026-10-21**) | 4.1 | — (parallel) |
| E | Lifecycle module + booking policy + notes (**implemented 2026-10-21**: policy exposed at `GET /api/rentals/policy`) | 4.2, 4.3 | A |
| F | Meter readings, completion, usage metrics (**implemented 2026-10-21**: 3.4 left off, so readings never touch the machine meter or price suggestions) | 3.x | A, E |
| G | Payment attempts + reconciliation (**implemented 2026-10-21**: attempts without a session never block cancellation) | 2.1 | A |
| H | Cancellation/refund + signature deadline + clause 9 text | 2.2, 2.3 | B, G |
| I | Date-change amendments + clause 2 text | 2.4 | B, E |
| — | Phase 5 items | 5 | as needed |

## 5. Acceptance gates

| Gate | Must pass |
| --- | --- |
| Phase 1 | A same-ID PATCH/PUT can't reprice any rental. Profile, listing or template edits can't change accepted terms. Both roles sign one revision, and a stale view is rejected. A changed OTP target can't be falsely verified. Spoofed XFF is ignored. Invalid readings are rejected. An unsigned rental can't be completed. The contract no longer mentions excess-hour charging. |
| Phase 2 | Every cancellation scenario in 2.2 passes. Duplicate refunds and late webhooks are recovered. Dates are released exactly once. The deadline auto-cancels with a refund. Amendment acceptance rechecks availability atomically and requires re-signing. |
| Phase 3 | The owner can check in, check out and complete from the dashboard. Readings never move money (asserted by a test). Usage metrics are shown to both roles and labelled informational. |
| Phase 4 | The chat acceptance cases above pass. Both dashboards derive their counters and actions from the same lifecycle. Single bookings and recurrence enforce the same lead time and roles. Notes persist. |

## 6. Removed from the audit scope by this decision

- T03 included-hours snapshot, the excess formula `max(0, final − initial − included) × rate`, the extra-charge ledger, supplementary checkout for overage, and the excess dispute/approval flow.
- The overage notification event (audit T05 improvement #1).
- The business question "how are excess hours rounded, priced, approved and collected": it no longer applies.
