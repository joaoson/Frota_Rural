# T01–T07 feature validation and improvement plan

Audit date: **2026-10-14**. Revision: **084a48ccdefd263c6647035979eab64e58d4e973**, branch `develop_joaofre_locacoes_integradas`, [PR #44](https://github.com/joaoson/Frota_Rural/pull/44).

## Overall result

The application has a substantial working rental flow, but the full T01–T07 delivery cannot yet be considered complete. **T05 and T06 meet their baseline scope. T01, T02, T04 and T07 need the corrections or missing workflows below. T03 is not implemented beyond storage fields.** Passing the current automated suite does not establish acceptance of requirements the suite does not exercise.

| Code | Assessment | Working today | Main remaining work |
| --- | --- | --- | --- |
| T01 — Rent listed machinery | Core flow works; partial acceptance | Dates/availability, server-calculated amount, temporary reservation, contract creation, Stripe Checkout, verified payment webhook, payment recovery | Freeze agreed prices; reconcile uncertain checkout creation; clarify prepaid minimum versus refundable caução; align server/UI booking rules; persist booking notes |
| T02 — Manage contracts | Partial | Participant-scoped list/view, evidence/print view, cancellation of unpaid pending reservations with date release | Paid/active cancellation and refund; in-progress checkout cancellation; proposed amendments, approval/rejection and new contract revisions |
| T03 — Charge excess meter hours | Missing | Owner-authorized API updates to initial/final meter integer fields | Validated meter capture with evidence, included-hours/rate snapshot, excess calculation, dispute/approval, supplementary collection and closeout UI |
| T04 — Digital acceptance | Core implemented; evidence defects block acceptance | Two-party authorization, payment guard, OTP option, timestamp/hash evidence, append-only storage, status changes, notifications | Immutable full contract revision; bind both signatures and viewed document to that revision; bind OTP to actual verified address; trusted proxy handling |
| T05 — Rental notifications | Baseline implemented | Durable party-scoped inbox, rental/payment/signature events, deduplication, read/dismiss, filters, pagination, bell and deep links | Add events for future refund/amendment/excess workflows; reminders, delivery preferences and optional push/email are improvements |
| T06 — Recurrence | Baseline implemented | 2–12 weekly/biweekly/monthly occurrences, preview, current prices, conflict checks, atomic/idempotent creation, separate contracts/payments | Grouped series management/recovery, hold-expiry explanation, individual/future-series change policy; share single-booking rules |
| T07 — Internal chat | Core works; reliability incomplete | Scoped posting/rental threads, participant checks, real-time messages, persistence, unread badge, HTTP fallback and moderation | Correct live read receipts, older-history pagination, offline catch-up, lost-ack recovery, dashboard refresh and actionable error handling |

## Verification evidence

The [GitHub Actions run for this exact revision](https://github.com/joaoson/Frota_Rural/actions/runs/38520219713) completed successfully:

- **378 Django tests**, including PostgreSQL migration upgrade paths and concurrency/access checks.
- **101 frontend tests** across 20 files.
- **102 Playwright scenarios** across Chromium, Firefox and WebKit (34 scenarios × 3 engines).
- **19 development-helper tests**; configuration, lint, TypeScript/build, Django checks and migration-drift checks passed.
- DOCX conversion also passed in its [separate workflow](https://github.com/joaoson/Frota_Rural/actions/runs/38520215205).

This audit additionally ran **15 focused characterization probes**: seven rental/payment probes, five contract/evidence probes and three real-message-page component probes. They deliberately assert the problematic behavior and reproduced the findings described below; they are not 15 passing acceptance tests. Backend probes used a temporary PostgreSQL test database in the local Docker stack; frontend probes used simulated transports. All external payment/email calls were simulated. No new claim of a live completed Stripe payment, refund, email delivery or Supabase acceptance is made.

A manual local browser walkthrough confirmed the seeded tenant dashboard, rental list, available cancellation/payment controls and recurrence form. It did not submit new reservations or payments. Application source was unchanged; the deliverable is this audit and the accompanying architecture report.

## Highest priorities

Priority **P1** means address before accepting the affected feature or relying on it for real rental operations. **P2** means a concrete remaining defect or important reliability/usability improvement. No production outage was demonstrated.

1. **P1 — Preserve agreed money.** A tenant can PATCH the unchanged posting ID after its hourly rate changes and rewrite a paid rental from R$3,024 to R$5,040 while its approved payment remains R$3,024. The update path at `BackEnd/rentals/services.py:86–124` treats the presence of the posting field as permission to reprice. Freeze price inputs/amounts and restrict later changes to explicit consented amendments.
2. **P1 — Preserve what was signed.** A normal address change between signatures produces two different document hashes, yet the contract becomes signed. Submitting a stale viewed document also signs the newer document silently. Freeze complete terms, including rendered clauses, and require both parties to accept the same immutable revision. The evidence chain currently detects the mismatch only after acceptance.
3. **P1 — Deliver T02 money-aware cancellation.** Paid cancellation returns 409 and leaves the reservation occupying its dates; no refund workflow exists. This guard avoids unsafe data loss but does not fulfill T02. Add explicit cancellation/refund states, retry/reconciliation, date-release policy and counterpart notification.
4. **P1 — Deliver T03 and enforce meter rules.** Negative and decreasing readings are accepted; an owner can complete an elapsed active rental with no readings or signatures. Add the full capture → validate → calculate → approve/dispute → collect → settle flow. The printed contract currently promises photo/validation/refund workflows that the application does not provide.
5. **P2 — Finish amendment approval and evidence identity.** T02 has no change proposal/approval/revision flow. OTP delivered to an old address can mark a new address verified, and arbitrary forwarding headers enter signature evidence.
6. **P2 — Repair chat recovery and history.** Three reproduced defects leave visible messages unread, hide all history older than 50 messages, and miss the first messages received while an empty conversation is offline. Additional static findings cover unacknowledged retries, a stale dashboard inbox and ignored socket errors.

Detailed triggers, file locations, positive implementation details and acceptance tests are included in the feature sections below.

## Cross-feature consistency and maintainability

### Rental lifecycle and dashboard meaning

Payment marks a rental `active`; both signatures change it to `signed`. The tenant dashboard's “LOCAÇÕES ATIVAS” counter only includes `active` (`FrontEnd/src/pages/dashboard/DashboardLocatario.tsx:245`), so signing removes it from that counter while it remains in the current-rentals list. The owner dashboard uses a different set including pending and awaiting-payment (`DashboardLocador.tsx:220–224,377`). This is a static, directly traceable inconsistency, additional to the 15 executed probes.

Define shared business meanings for reservation, awaiting payment, awaiting signatures, ready for handover, in use, returned, awaiting settlement, completed and cancelled. Derive counters and allowed actions consistently; distinguish future reservations from equipment actually in use. Add status-driven dashboard tests for both roles. Keep occupancy rules explicit rather than assuming a financial status alone determines availability.

### Concentrate rules in deeper modules

- **Rental lifecycle module — Strong.** Pricing and transition rules currently span rentals, payments, contracts, recurrence and multiple frontend status lists. Greater depth should put transition invariants in one implementation while preserving the existing domain apps and database locks. Locality: one place to enforce paid-price immutability and completion rules. Leverage: single rentals and recurring occurrences use the same policies.
- **Contract revision module — Strong.** Rendered clauses, mutable document fields and evidence currently evolve separately. A deep module should own frozen terms/revisions and acceptance evidence. The interface should conceal live profile/listing details after agreement. Locality: one authoritative agreed document. Leverage: display, print, both signatures and amendments use the same revision.
- **Payment attempt and settlement module — Strong.** Persisted payment attempts should coordinate the provider adapter, quote, uncertain responses, refunds and supplemental charges. The existing mock-provider seam is valuable; strengthen it with durable identifiers and reconciliation. Locality: financial transitions in one implementation. Leverage: checkout, cancellation and overage share retry-safe behavior.
- **Chat synchronization module — Worth exploring.** The full message page and dashboard inbox separately maintain remote conversation state. Share confirmed cursors, pagination, read markers and recovery behind one interface. HTTP and WebSocket are already two real adapters at this seam. Locality: reconnect and unread fixes apply to both screens.

The accompanying HTML report illustrates these four candidates before/after. These are scoped changes within the existing modular Django/React application, consistent with ADR 0001 and its local/Supabase update; splitting into microservices would not resolve the observed defects. No `CONTEXT.md` domain glossary exists at this revision; use the established locação/contrato/pagamento/recorrência terms if one is introduced.

### Integration and operational improvements

- Persist payment attempt/provider identifiers before relying on the response; reconcile a successful remote creation whose response or local commit is lost. Stripe supports stable idempotency keys for retrying POST operations: [official idempotency documentation](https://docs.stripe.com/api/idempotent_requests).
- Model cancellation and refund progress separately. A refund can be pending or fail, so requesting one must not immediately claim money was returned: [official refund lifecycle](https://docs.stripe.com/refunds).
- Keep signed webhook validation and idempotent processing, add a durable event/attempt audit trail and reconciliation for unknown sessions or stuck manual-review payments: [official webhook guidance](https://docs.stripe.com/webhooks). Test duplicate and out-of-order events plus application failure after provider success.
- The current in-database notification writes already share the domain transaction. Add an outbox/retry worker if delivery expands to email/push/socket; do not replace durable inbox rows with best-effort network sends.
- Add server pagination to growing rental/contract lists and use the chat pagination already available. Measure query counts and large seeded histories; the owner dashboard is currently 1,296 lines and the tenant dashboard 501, with business-status decisions embedded in rendering.
- Existing dependency audit findings are recorded in `Devops/CI_CD.md`: 30 affected packages (1 critical, 20 high, 7 moderate, 2 low). These counts are from the preceding dependency audit of the unchanged lockfile, not a new dependency scan in this task. Review reachable runtime versus tooling paths and upgrade with regression coverage before cloud deployment.

## Suggested delivery sequence and acceptance gates

| Phase | Delivery | Acceptance gate |
| --- | --- | --- |
| 1 — Protect existing records | Lock agreed rental prices; immutable contract content; stale-view rejection; OTP/address and trusted-IP fixes; meter input validation; align promised clauses | Same-ID PATCH/PUT cannot reprice paid/signed/completed rentals; profile/listing/template edits cannot change accepted terms; both roles sign one revision; changed OTP target cannot be falsely verified |
| 2 — Complete contract management | Durable payment attempt/reconciliation, cancellation/refunds, amendment proposal/approval and revised signatures | Pending/open-checkout/paid/signed cancellation scenarios; duplicate refund and late webhook recovery; explicit availability-release timing; amendment approval rechecks inventory and price difference atomically |
| 3 — Complete T03 | Handover/return readings and evidence, included-hours snapshot, excess charge calculation, dispute/approval, collection and final settlement | Zero/exact/excess hours, invalid/decreasing readings, two-party disagreement, supplementary payment failure/retry, duplicate webhook, completion preconditions, both-role UI walkthrough |
| 4 — Close reliability gaps | Chat read markers/history/catch-up/ack/error handling; dashboard refresh; persistent booking notes; consistent booking and dashboard policies | Two-browser live read receipts; 120 messages and 60 threads accessible; offline first-message recovery; lost acknowledgment produces one stored message and successful retry; notes survive reload |
| 5 — Improve ongoing use | Grouped recurrence management, expiry/reminders, new event types, external delivery preferences, pagination and observability | Reopen series; identify paid/unpaid/expired occurrences; clearly scoped future edits/cancellations; notification rollback/deduplication and recoverable delivery failures |

Chat fixes can run in parallel with phases 1–3. Do not postpone the correctness work to implement visual polish first. Add the missing acceptance cases to the regular suite; the existing green tests remain valuable but currently miss the behaviors reproduced here.

## Business decisions needed before implementing the missing flows

- Does “calção” mean a refundable security **caução**, a minimum prepaid rental charge, or full prepayment? Define its amount, fee treatment, balance, release/refund and cancellation rules.
- Are included hours eight per inclusive calendar day? How should excess hours be rounded, priced, approved/disputed and collected? The current contract text mentions direct payment to the owner, whereas T03 calls for platform collection.
- Which party records and confirms handover/return readings, and what evidence is mandatory? Separate operational return from financial settlement.
- Which pending or active rentals may be cancelled, by whom, with which fees, and when are dates released? Define amendment consent and signature-deadline behavior.
- Is seven-day notice intended? The booking screen enforces it, while direct creation/recurrence use different limits. Define tenant/operator/admin booking permissions and whether self-rental is ever allowed.
- For recurrence, are immediate independent payments acceptable for up to 12 reservations with 30-minute holds, or should confirmation/payment be staged?

These decisions were not guessed or implemented as part of this audit. The engineering defects above can be addressed without waiting for all product-policy choices.

---

# Detailed evidence

## T01 and T03

### Acceptance assessment

| Requirement | Assessment | Implemented evidence | Gap |
|---|---|---|---|
| T01 choose listed machine and rental dates | Mostly implemented | Authenticated `/reservar/:id`, calendar occupancy+cleaning, inclusive-day pricing, server validation, locks, POST `/api/rentals` creates reservation+contract atomically | Server allows roles/self-rental and lead times inconsistent with UI; collected notes discarded |
| T01 payment entry and confirmation | Implemented with mocked integration coverage | Stripe-hosted checkout collects payment details; POST `/api/rentals/<id>/checkout`; signed webhook sets payment approved/rental active; browser polls and handles expired/review/error/retry | No provider idempotency key/reconciliation for session creation whose response or local save fails; not live-tested this audit |
| T01 duration-dependent minimum/caução | Partial / business definition needs confirmation | Checkout charges `hourly_rate × 8 × inclusive calendar days × 1.05` | This is 100% of estimated rental plus platform fee. There is no separate security deposit, deposit policy, balance/capture/release/refund model. If “calção” means prepaid minimum rental, implementation matches that amount concept; if refundable security deposit, it does not |
| T03 excess usage calculation and collection | Not implemented | Two nullable integer rental meter fields; owner-only generic PATCH accepts them on active/signed rentals | No check-in/check-out UI, photo evidence, meter validation, included-hours snapshot, excess formula/service/ledger, supplementary checkout/invoice/status or settlement workflow |

### Representative end-to-end code trace

1. `FrontEnd/src/app/routes/protectedRoutes.tsx:20-22` restricts `/reservar/:id` to tenant/admin in UI.
2. `FrontEnd/src/pages/postings/Reservar.tsx:452-463` loads public occupancy, calendar blocks occupied days and one-day preparation buffers; lines394-398 and632-634 add a UI-only seven-day minimum notice.
3. UI step1 calculates inclusive calendar days (`:45-51`) and shows rate×8/day plus5% (`:17-19`, `:574-583`). “Pagar e Avançar” at1001-1006 invokes `pagar` at652.
4. `pagar` POSTs rental at660-665, remembers its ID in state+URL before provider call at668-674, so ordinary retry does not duplicate reservations. Backend `RentalService.create` at51-75 verifies actor binding and pending status, locks posting+machine, revalidates, recalculates total, creates contract and notification atomically.
5. `PaymentService.create_checkout` at48-109 checks tenant, status, inventory and dates, reuses known open sessions, creates Stripe-hosted checkout and records payment. `payments/pricing.py:20-26` defines actual amount; client total cannot set it.
6. Browser redirects to provider and returns to same rental. It never trusts URL `pagamento=sucesso` as payment proof: `Reservar.tsx:536-568` polls payment API, handles `requires_review` and expiration, then loads rental/document on approved.
7. `PaymentService.handle_webhook:125-144` verifies Stripe signature and only approves paid completion/success. `_approve:158-180` is atomic and duplicate-safe for known payment; overlapping late success enters review. `_expire:184-201` releases unpaid rental and cancels pending contract.
8. There is no analogous T03 UI route or operation. `ContractRepository` exposes booking/cancel/recurrence/signing at41-54, but no meter/extra charge operation. `AnaliseLocacao.tsx:52-64,80` shows clearly labeled proportional cost projection rather than actual meter usage.

### Findings, priorities, reproductions

#### P1: Paid/signed rental total can be rewritten through unchanged posting ID

Evidence: `BackEnd/rentals/services.py:86-90` rejects a *different* posting and direct total_price changes; its pending/payment restriction at100-104 only covers dates/operator. `:119-124` reprices whenever the payload contains `postings`, even unchanged and while rental is active/signed/completed. Current mutable listing hourly rate feeds calculation (`payments/pricing.py:23`).

Reproduced with APIClient as tenant: existing active rental paid3024.00 at hourly180, posting rate changed300, PATCH `/api/rentals/<id>` `{ "postings": "<same-posting-id>" }` →HTTP200, rental.total_price5040.00, approved payment still3024.00. This corrupts the agreed rental amount and generated/signed contract values. No direct price edit permission is needed; owner and tenant are scoped participants.

Improve: immutable rental pricing snapshot (currency, hourly rate, included hours, fee policy, base amount); exclude identity keys that are unchanged from update intent; never reprice after a payable quote is locked without a distinct consented amendment. Add regression tests for unchanged posting PATCH/PUT on awaiting_payment, active, signed and completed rentals, including changed listing rates and existing signature evidence.

#### P1: T03 is not delivered, and contract claims protections the implementation does not enforce

Evidence: meter columns are nullable plain integer fields (`BackEnd/rentals/models.py:20-21`); input serializer exposes them (`serializer.py:53-54`) but only validates dates (`:58-90`). `RentalService.update:105-107` checks owner and active/signed state, then saves arbitrary integer readings. Completion at94-99 checks only owner, active/signed and end_date≤now, and has no readings/evidence/overage/settlement preconditions.

Reproduced:
- owner PATCH active rental `{initial_hour_meter:-100, final_hour_meter:-150}` →200 with both negative values persisted;
- owner PATCH `{initial_hour_meter:1000, final_hour_meter:900}` →200;
- owner PATCH past active rental `{status:"completed"}` →200 while both meter fields null and signatures absent (fixture also no approved payment; active state alone is trusted).

`FrontEnd/src/pages/contracts/Contrato.tsx:314,327-345` promises required photo check-in/check-out and computed final amount; `:354-355` promises invalid/decreasing readings are rejected and requires regularization before completion. None exists. Clause4.3 at354 says excess is paid directly to owner, while T03 explicitly asks platform additional charging; this is a product-policy contradiction, not a legal conclusion.

Improve: dedicated check-in/check-out commands and readings with actor/time/photo, nonnegative monotonic meter validation, agreed readings/dispute path, server-only decimal computation `max(0, final-initial-included_hours) × locked_extra_rate`, auditable extra charge records, explicit supplementary payment operation using existing provider, idempotent events/webhooks, and finish/settle states separate from rental occupancy. Require valid readings before operational completion where policy requires them. Keep evidence and signed terms immutable. Add full API+UI tests for no overage/exact allowance/one hour excess/large readings/negative/decreasing/double submit/two parties conflicting/replayed webhook/disputed charge/extra collection failure.

#### P2: Stripe checkout creation cannot reconcile a lost response/local-commit failure

Evidence: `BackEnd/payments/services.py:98-108` calls `Session.create` without explicit idempotency_key and persists session only after response; transaction at47 rolls all local writes back on subsequent exceptions. Existing open-session reuse only applies to sessions already saved (80-90).

Reproduced with mocked APIConnectionError on first create, success on retry: first request502, second200, two Stripe Session.create calls, both idempotency_key absent, one local Payments row. This proves retry does not identify the original provider request. It does NOT prove real double-charging: a lost creation response may mean the customer never received its checkout URL. It does leave untracked possible remote sessions and missing reconciliation if provider creation succeeded but the response or local commit failed.

Improve: durable payment attempt with deterministic per-attempt idempotency key, request parameters/quote version persisted before provider call, reconciliation job and provider metadata linking attempt/rental; idempotent notification outbox for transaction-to-external boundaries. Test “provider accepted, network failed”, failure after remote create before local save, concurrency and late webhook for reconciled session. Avoid holding shared booking locks over long network calls where a durable reservation/payment attempt can preserve correctness.

#### P2: Booking notes are silently lost

Evidence: `FrontEnd/src/pages/postings/Reservar.tsx:950-957` collects Observações and state at386; creation payload at660-665 excludes it; `rentals/models.py` and input serializer have no notes field. A user entering pickup instructions believes they accompany the booking, but neither owner nor contract receives them. Static route+payload trace, not a new runtime UI probe.

Improve: persist notes as bounded, validated rental field and show to both participants; do not treat operational notes as an unversioned contract amendment. Alternatively remove the field until supported. Add UI test typing note and asserting submitted/persisted value and authorized owner visibility.

#### P2: API accepts self-rental/roles disallowed by booking UI

Evidence: UI route allows tenant/admin (`protectedRoutes.tsx:20-22`). Backend creation checks only `lessee.pk == user.pk` (`rentals/services.py:55-56`) and does not check role or owner distinction. APIClient as machine owner, lessee=self →HTTP201 with identical lessor_id and lessee. That account can enter a nonsensical two-party rental and potentially sign both roles if paid; this is a policy/authorization gap, rather than evidence of a cross-account data leak.

Improve: enforce intended booking role server-side and explicitly forbid owner=tenant (or document deliberate support if required). Add tenant/operator/owner/admin table-driven API tests; same invariants in recurrence.

#### P2: Seven-day lead-time rule differs between UI and API

Evidence: `Reservar.tsx:394-398,632-634` forbids start<today+7days; `rentals/serializer.py:75-77` and paymentservice62 only require future. Reproduced next-day POST →201. Thus direct API and recurrence can accept periods normal booking UI rejects.

Improve: choose one documented lead-time rule and enforce canonical server policy; return policy limits to UI. Avoid asserting that seven days is necessarily the correct business rule. Test today, tomorrow, six/seven days, timezone boundaries and recurrence parity.

### Existing good coverage and remaining validation

- `BackEnd/payments/tests.py` already covers unconfigured provider, webhook config, server amount, expiry renewal, tenant isolation, occupied periods, changed posting limits, open-session reuse, delayed success/failure, duplicate/expired webhook ordering, late paid overlap requiring review.
- `BackEnd/rentals/tests.py` covers contract creation/rollback, cleaning buffer, maxdays, reversed dates and private routes; `BackEnd/api/test_rental_access.py` covers actor spoofing, direct total tampering and generic status bypass but misses same-postings repricing.
- `FrontEnd/src/features/payments/tests/paymentReview.test.tsx` covers approved/pending/review/expired return handling, retry preserving rentalID, refresh, cancellation, unavailable provider, public occupancy and unmount polling cleanup.
- No complete actual Stripe test-mode browser/webhook cycle was run here. Existing provider tests use mocks. No configured production payout, refundable deposit or supplementary charge flow was established by repository trace.
- No source edits or branch/git mutations in this audit.

### Recommended delivery order

1. Fix paid-price invariant and meter validation; align contract screen statements with available behavior.
2. Agree minimum-prepayment vs refundable caução, included hours, excess rate/fees, responsible readers and dispute/payment timing.
3. Implement T03 as a vertical slice: lock pricing → meter evidence → overage preview/confirmation → extra checkout → webhook settlement → notifications/dashboard.
4. Add durable payment attempt/idempotency/reconciliation and refund/deposit integration coordinated with T02.
5. Persist notes and unify authorization/availability policy across direct rentals and recurrence.

## T02 and T04

### Requirement verdict

| Requirement | Verdict | Evidence |
| --- | --- | --- |
| T02 list and view contracts | Implemented | Authenticated participant-scoped `ContractService._queryset/get/list`, document and evidence routes; dashboard lists and contract print page. |
| T02 cancel pending/active and release machinery | Partial | Only unpaid `pending` rentals can be cancelled. `awaiting_payment`, paid `active`, and `signed` cannot; UI hides cancellation except `pending`. Cancellation updates contract status and availability excludes cancelled rentals. |
| T02 refund payment on cancellation | Missing | No refund operation, refund entity/status, refund webhook handling, or refund UI. Paid reservations cannot be cancelled. |
| T02 request edits pending acceptance and notify parties | Missing | Tenant may directly edit unpaid rental dates/operator through generic PATCH, but no proposal, reason, approval/rejection, revision, both-party acceptance, or edit-request UI. Paid contract awaiting signatures cannot be edited. Ordinary rental edits do generate generic notifications. |
| T04 both parties digitally accept | Implemented core flow with material evidence defects | Roles and participant authorization enforced, paid booking required, default email OTP, signatures record identity/time/hash/IP/agent, append-only guards, row locks serialize two signatures, status and in-app notifications change. The accepted document is not frozen or compared to what the signer viewed; signatures can refer to different document hashes while contract becomes signed. |

### Findings, in priority order

#### P1 — A contract can be marked signed even though the parties accepted different documents

- `BackEnd/contracts/contract_document.py:155-213` reconstructs every document from current user profile, current machinery/posting fields and current rental values.
- `BackEnd/contracts/models.py:9-16` and `:49-64` persist only links, flags and document hash/version; neither the canonical document nor the clause text is snapshotted.
- `BackEnd/contracts/services.py:305-307` rebuilds current document at signing. `:332-340` marks the contract/rental signed solely from the two boolean flags, without comparing the signature hashes.
- `BackEnd/users/services.py:78-83` and `BackEnd/users/serializer.py:24-34,59-77` permit ordinary profile changes to fields used in the contract.

**Reproduced with public API calls:** sign as tenant → `PATCH /api/users/<tenant>` to change address → sign as owner. Both signatures return HTTP 200; their document hashes differ; contract status becomes `signed`; `/api/contracts/<id>/evidence` returns `cadeia_integra=false` because the first signature no longer matches current document. A normal profile edit after signing similarly changes what the user can print, and the original accepted full document cannot be reconstructed from its hash.

**Fix:** persist a full immutable contract revision (canonical terms, parties, equipment/rates, relevant complete clause text or immutable template version and content), serve it for display/PDF/evidence, and sign the same revision for both roles. A new amendment must create a new revision, not mutate a signed document. Enforce signature uniqueness per revision+role, with both roles bound to the same revision.

**Cross-feature connection:** the payments audit also confirmed a same-posting PATCH that recomputes `rental.total_price` after a rate change even for a paid rental (`BackEnd/rentals/services.py:119-124`). That bug changes contract terms too and should be fixed independently of snapshots.

#### P1 — The user can silently sign terms different from the document they just read

- `BackEnd/contracts/serializer.py:21-42`: sign input contains role/name/OTP only.
- `FrontEnd/src/features/contracts/api/ContractRepository.ts:146-155`: request never sends the viewed hash/revision.
- `BackEnd/contracts/services.py:305-307`: current document is read at submission, regardless of what the browser displayed.

**Reproduced:** GET contract and retain hash → change profile address → POST sign without refreshing. HTTP 200 stores the new hash, which differs from the displayed document hash. Locks serialize writes, but do not solve this stale-view acceptance.

**Fix:** return immutable revision ID/hash to the UI; require it on OTP/sign submission and compare it server-side. On stale revision return 409 with an instruction to reload/review. A client supplied hash is an optimistic concurrency check, not the authoritative evidence; server still calculates the stored hash.

#### P1 requirement gap — Paid/active cancellation and refund are absent

- `BackEnd/rentals/services.py:91-104`: cancellation only when status is `pending` and no non-expired payment exists.
- `FrontEnd/src/features/dashboard/components/RentalCard.tsx:136-139,201-205`: cancel visible only for `pending`.
- `BackEnd/payments/services.py:124-144`: handles checkout complete/async success/expiry/failure only. No Stripe refund calls or refund events.
- `BackEnd/payments/enums.py:4-8`: pending/approved/expired/requires_review only.
- `BackEnd/payments/availability.py:12-16,30-35`: active/signed rentals continue occupying the machine.

**Reproduced:** PATCH paid active rental to cancelled returns 409, keeps rental active, payment approved and requested interval occupied. This is an intentional guard against unsafe cancellation, but it leaves the stated T02 requirement undelivered.

**Fix:** implement a dedicated cancellation/refund command, explicit policy snapshot and reason, local cancellation/refund states, Stripe refund identifiers/idempotency, recovery/reconciliation, role/state rules and party notifications. An in-progress Checkout must be expired/coordinated before cancelling. Make release timing explicit and retry failed refunds without reopening or double-refunding bookings. Test duplicate requests, webhook replay, timeout after provider success, concurrent payment/acceptance/cancellation and partial refund failure in Stripe test mode.

#### P2 requirement gap — Pending-contract amendment requests are not implemented

- `BackEnd/rentals/services.py:100-104`: only unpaid pending rental dates/operator can change; a paid contract pending signatures is blocked.
- `BackEnd/contracts/urls.py`: list/detail/sign/evidence/OTP only.
- `FrontEnd/src/features/contracts/api/ContractRepository.ts:41-54`: no edit/amendment interface.

**Fix:** proposal object with requested field changes, reason, proposer, original revision, statuses pending/accepted/rejected/expired and both-party decision rules. Preserve original terms/availability until approved. Revalidate availability under current machine locks at acceptance and handle price delta/payment before a new revision activates; notify both parties at each step. Add visible request/approve/reject actions and change comparison.

#### P2 — OTP evidence can claim verification of an email which never received the code

- `BackEnd/contracts/services.py:197-215` stores the destination email in the OTP row.
- `:348-375` consumes OTP by contract+role without comparing stored email to current signer email.
- `:313-318` records current signer email and `otp_verified=true`.
- Profile email is directly editable (`BackEnd/users/serializer.py:24-34,59-77`).

**Reproduced with OTP required:** request OTP at old email (outbound email mocked), change profile email via authenticated API, sign with old code. Signing returns 200 and evidence records `new-unverified@example.test`, `otp_verified=true`; OTP row still has the original email. No external email delivery was tested.

**Fix:** bind OTP to signer ID, destination email and immutable contract revision; reject if those change, or record the actual verified address separately from current account address. Invalidate outstanding signature OTPs when account email changes. Consider separate email verification on profile changes.

#### P2 — Signature IP trusts arbitrary client-supplied forwarding header

- `BackEnd/contracts/signature_evidence.py:47-53` accepts the first `X-Forwarded-For` value unconditionally.

**Reproduced:** a request sent directly to Django with `X-Forwarded-For: 203.0.113.77` records that address in signature evidence, despite a different socket peer. No trusted-proxy boundary is checked.

**Fix:** trust forwarding headers only from configured proxies which overwrite/sanitize them; otherwise use `REMOTE_ADDR`. Test direct requests and the actual ingress/proxy chain. This is an evidence integrity issue; IP alone is not proof of signer identity.

#### P2 — Printed clauses promise workflows absent from the product, and clause content is outside the document hash

- `FrontEnd/src/pages/contracts/Contrato.tsx:238-241`: says extension/amendment is recorded with party approval.
- `:467-468`: promises cancellation with refund and automatic cancellation/refund if not signed in time.
- These terms are hardcoded only in the React view. Backend `build_contract_document()` contains field values and `DOCUMENT_VERSION='1.0.0'`, not the actual clauses or a checksum of their immutable content.
- No signature deadline field, scheduler or paid refund path was found.

**Impact:** users see contractual operational promises that cannot be completed, and a future frontend clause change could alter the rendered text without changing the backend hash. This is a software consistency finding, not a legal-validity assessment.

**Fix:** version and freeze the complete agreed content; align published wording with implemented policy, then implement the missing promised workflows before presenting them as available. A legal review of the final contract template is a separate domain task.

### Positive implementation details to preserve

- Rental creation automatically creates one pending contract in the same database transaction (`rentals/services.py:50-75`).
- Listing, document and evidence access is participant scoped (`contracts/services.py:49-65`); wrong party cannot sign/request the other party's OTP.
- Payment/availability guards run before and inside the signature transaction (`contracts/services.py:257-269,294-303,383-387`).
- Both-signature writes lock posting/machine, rental and contract in the order used by booking/payment (`:294-301`), and existing concurrency coverage checks two simultaneous signers.
- Hash chain, server timestamp, signer ID/name/email, agent and OTP fact are stored. Model methods and PostgreSQL UPDATE/DELETE triggers guard against ordinary changes to evidence (`contracts/models.py:29-85`; `api/migrations/0002_contractsignatureotps_contractsignatures.py:10-24`).
- OTP uses cryptographic six-digit generation, hashed code, expiry and wrong-attempt accounting. Email-send failure rolls back the new OTP (`contracts/services.py:181-228,348-380`).
- Signature events and completion events create transactional in-app notifications for both participants with durable deduplication keys (`contracts/services.py:341-345`; `notifications/events.py:21-23,27-45`).

### Further improvements (lower priority)

1. OTP resend cooldown and per-user/IP throttling; signing routes currently have no throttle configuration. Reject OTP requests on already-signed or closed contracts. Give frontend expiration/countdown and a clear resend state.
2. Consume valid OTP and record acceptance atomically while retaining wrong-attempt accounting; a transient error during `_record_acceptance` currently burns the valid OTP in a separate committed transaction and requires a new email.
3. User-readable lifecycle names. Rental `active` means paid but unsigned, while `signed` means both accepted; prevent UI and completion logic from treating paid as fully executed. Payments audit separately found completion possible before either signature.
4. Paginate contract lists, prefetch the reverse contract used by nested rental serializers, and let users filter by date/status/counterparty. Current contract list returns all owned/tenant contracts.
5. Persist and serve a stable archival PDF/export with the immutable revision and evidence; printing from live React data is insufficient for historical retention.
6. Sign request idempotency/recovery: after server success but client timeout, a retry currently reports `already_signed`; return/reload the existing receipt. Repository also performs a second rental GET after signing (`ContractRepository.ts:159`); its failure can display signing failure even though signature persisted.

### Validation performed and limits

Read existing `BackEnd/contracts/tests.py` (14 tests) and `BackEnd/contracts/test_signature_access.py` (7 tests), including payment/role access, duplicate signing, OTP dispatch failure, wrong OTP accounting and concurrent two-party signing. Existing tests cover the happy path and useful guards but not document/profile drift, stale view, changed OTP email or full T02 refund/amendment acceptance.

Executed five temporary characterization tests through Django using the local Docker backend and local PostgreSQL test database:

```sh
docker exec -e PYTHONPATH=/tmp:/app frota-local-715856fc-backend-1 python manage.py test frota_contracts_probe --noinput --verbosity 2
```

Result: **5/5 reproduced their expected defects**; Django system check found no issues; test DB destroyed. Probe source `/tmp/frota_contracts_probe.py`, log `/tmp/frota-contracts-probe.log`. Application files remain unchanged. OTP send mocked; no live Resend, Stripe or Supabase validation is claimed.

Suggested implementation order: fix paid-price bypass and immutable revision/stale-view guards → fix OTP identity/IP evidence → implement explicit cancellation/refund lifecycle → implement amendment approval with new revision → add deadline reminders/expiry and UI recovery/performance polish.

#### Additional confirmed UI gap — rental completion/return action

`FrontEnd/src/features/contracts/api/ContractRepository.ts:41-54` exposes cancellation/signing/recurrence but no complete-rental or meter-update command. Dashboard/shared `RentalCard` renders status, payment, cancellation, recurrence, reviews and details, with no handover/return/complete action. Rental meter fields are merely mapped (`contractMapper.ts:48-49`), while the machine-edit hour meter is a separate equipment field. Thus backend completion is possible through PATCH but there is no ordinary owner dashboard flow to finish a real rental, collect readings and unlock the completed-review workflow. Add a return/inspection/completion UI after implementing authoritative status and metering safeguards. This is shared T02/T03 lifecycle scope, not a new unrelated requirement.

## T05, T06 and T07

### Requirement coverage

| Requirement | Assessment | Implemented evidence | Caveats |
|---|---|---|---|
| T05 rental/payment/contract notifications | Implemented for current domain events | Explicit transactional events for create/recurrence/edit/cancel/complete; checkout pending/approved/expired/manual review; either signature and final signature. Separate recipient rows, durable deduplication, account-scoped read/dismiss APIs, filters/pagination, bell and dashboard deep links | In-app polling up to 30 seconds, not external email/push. Refund/edit-request/overage events cannot exist until those missing business workflows exist. Chat unread badge is separate from bell. |
| T06 reuse rental for future occasions | Implemented baseline | Tenant-only source; 2–12 weekly, biweekly or monthly future dates; preserves local starting time, duration and operator; computes current price; preview; month-end anchoring; machine-wide availability/cleaning; atomic batch; idempotency; fresh unsigned contracts and independent payments | Fixed finite batch, not a standing subscription. Every occurrence holds for 30 minutes and requires separate payment. No series retrieval/edit/cancel/recovery workflow. |
| T07 chat between rental participants, realtime and notifications | Implemented but incomplete in reliability/usability | Shared REST/WS service; scoped rental/posting threads; renter/owner/operator authorization; Redis fanout; global unread badge; optimistic send/idempotency; moderation; history endpoint; reconnect and HTTP fallback | Several confirmed client bugs below; existing happy-path tests miss them. |

### Findings

#### P2: Messages read while conversation is open remain unread (reproduced)

- `FrontEnd/src/pages/messages/Mensagens.tsx:77–79` displays every incoming message but does not call `markRead` or `sendRead`.
- The only read operation is initial navigation at `:149–152`; entering the thread once marks history read, but ongoing received messages remain unread indefinitely until reopening/reloading.
- Trigger: two users keep the thread open, one sends a new message. The other sees it but retains an unread badge and sender does not get a read receipt.
- Focused Vitest probe rendered real page, emitted onMessage, asserted new content rendered and markRead call count stayed at one. Confirmed.
- Improvement: mark only the latest visible received message read while tab is visible/active; send an up-to cursor, preserve accurate unreadThreads, coalesce read requests and resync after reconnect. Add two-browser test checking counters and read receipts without reload.

#### P2: Older messages become inaccessible after first 50 (reproduced)

- `FrontEnd/src/pages/messages/Mensagens.tsx:144–148` fetches exactly 50 messages and discards `hasMore`.
- `:265–280` renders a scroll container with no load-older control or pagination callback.
- Trigger: a thread has 51+ messages. Only newest 50 appear. Scrolling cannot load remaining history although backend supports before/before_id pagination (`BackEnd/chat/services.py:333–364`). Similar first-50 cap affects thread lists at Mensagens:120 and ChatInboxPanel:25.
- Probe returned 50 results and hasMore=true to real page: only one listMessages call, no older-history control. Confirmed.
- Improvement: cursor-based load-older/infinite pagination, stable scroll anchor, visible error/retry, paginated thread list. Acceptance: 120-message history loads in order without duplication.

#### P2: Reconnect misses first messages in previously empty thread (reproduced)

- `FrontEnd/src/pages/messages/Mensagens.tsx:101–114` exits early at :104 when local history is empty, so no REST catch-up runs.
- Trigger: open empty conversation, disconnect, peer sends first message, reconnect. Redis does not replay events; the conversation stays empty until reload.
- Focused probe mounted empty thread then invoked onResync: no second history request. Confirmed.
- Other static reconnect risk in same code: newest item may be optimistic `pending-<UUID>` (:193–204), then after_id is invalid (:106). Use last confirmed server cursor, handle absent cursor by fetching recent history, catch retry errors, and abort/ignore stale resync responses on navigation. Present code has no catch on async resync.
- Acceptance: offline reception on empty thread and with pending send; reconnect loads every missing message once.

#### P2: WebSocket retry of already-persisted message never acknowledges sender (high-confidence static)

- `BackEnd/chat/services.py:127–130` and :144–150 return existing message and created=False for idempotent replay without fanout.
- `BackEnd/chat/consumers.py:137–141` only pushes unread for created=True, sends no acknowledgment when replayed; `_persist` discards message payload at :181 and returns receiver/created at :190.
- Client `Mensagens.tsx:168–185` uses WS whenever open and waits for a message.new echo; after ten seconds marks failed. `handleRetry` at :210–214 uses same client_id, correctly, but replay produces no echo and fails again.
- Trigger: original send commits but its echo is lost; user presses Reenviar once reconnected. No duplicate data, but message misleadingly remains failed. This compounds reconnect pending-cursor defect.
- Improvement: sender-specific message.ack including canonical message for both created and replay outcomes, or REST reconciliation for uncertain sends. Reject same client_id reused with different thread/content instead of serializing an old message under new thread_id.
- Not executed with real WS/db in this subtask; static branch combination is direct and unambiguous.

#### P2: Dashboard chat inbox does not update while mounted (high-confidence static)

- `FrontEnd/src/features/chat/components/ChatInboxPanel.tsx:23–37` loads local state once on mount; no useChatEvents subscriber, query invalidation or interval.
- `FrontEnd/src/contexts/ChatSocketContext.tsx:40` sends thread.updated only to subscribers, and only unread counts are updated centrally (:43–45).
- Trigger: leave dashboard Chat tab open while peer starts/replies to thread. Navbar unread count updates, dashboard conversation preview/list does not until remount/reload.
- Improvement: use server-state query plus thread.updated invalidation/merge and reconnect refresh; share paginated inbox with /mensagens rather than maintain duplicate local state.

#### P2/P3: Actionable WebSocket errors silently ignored (static UX deficiency)

- Backend `chat/consumers.py:110–115` sends error frames for forbidden/rate-limit/validation; frontend `features/chat/hooks/useChatSocket.ts:131–167` has no error case or handler.
- E.g. chat becomes read-only following cancellation or user exceeds rate limit; send appears pending for 10 sec then generic Reenviar without explaining refusal.
- Improvement: correlate error frames with client_id/thread_id; fail immediately with reason, update permissions, reserve retry for recoverable failures. Add rate-limit and cancelled-while-open tests.

### T05 details and improvement opportunities

Strengths:
- `notifications/models.py:29` uniqueness per recipient/event protects replay even after dismissal.
- `notifications/events.py:27–45` participates in business transaction and targets lessee + owner.
- `notifications/views.py:14–66`: user-filtered reads/writes, hidden other-user records, persistent read toggles and soft dismissal.
- `NotificationStore.ts:20–29`: 30 sec polling, focus refresh, no background polling, AbortSignal. Keys include userId.
- `NotificationList.tsx:42–45,52`: refresh failures retain existing rows and explain staleness; no bug found here.
- Existing notification tests cover transactional rollback, provider replay/expiry/manual review, two signatures, authorization, filtering, persistence, recurrence replay. Browser tests cover read/dismiss across parties and 30s refresh/deeplink.

Improvements (not baseline failures):
1. Add refund, edit-request decision, overage, due-soon, and hold-expiry events once matching domain transitions exist; do not invent notifications disconnected from real workflows.
2. Generalized event envelope/type registry; keep domain commands separate from presentation text and delivery channels. Transactional outbox if email/push/WS added, retries and delivery diagnostics. Current in-DB transactional inbox is already durable and should remain so.
3. Avoid self-action noise where appropriate (notify counterpart, optionally activity history to actor); define operator notifications if operator scheduling is intended.
4. Add unread-count-only endpoint or low-cost server push if scale needs it; polling currently fetches 20 records for badge every 30s.
5. Preference settings/external delivery/retention are optional enhancements, not required by table wording.

### T06 details and improvement opportunities

Strengths:
- `api/recurrence.py:49–56` tenant-specific source prevents enumeration.
- `:59–67` handles monthly end dates and leap years.
- `:70–123` validates active machine/posting/operator, tomorrow+, duration/window/caps, cleaning conflict, current server pricing.
- `:134–175` transaction, user-idempotency lock, shared posting+machinery SELECT FOR UPDATE, whole-series rollback, fresh rentals/contracts/events.
- Existing tests include concurrent requests across listings of same machine; do not misreport select_related machinery locks as missing.
- UI invalidates preview if inputs change, stable attempt key for network retries, explicit no automatic charge and per-reservation payment.

Improvements (not required baseline blockers):
1. Series GET/history view with grouped states/payments, count of paid/unpaid/expired, reopen flow after closing dialog. Existing API only preview/create, recurrence FK/index stored on rentals.
2. Explicit series edit/cancel policy (single occurrence / this and future / all unpaid), conflict preview and audit trail, integrate actual refund policy. No automatic mass cancellation until money rules exist.
3. Make pending hold expiry an explicit lifecycle state + explain/remind expired unpaid occurrences. 12 independent immediate checkouts in 30 min is hard; improve progressive confirmation or deliberate batch checkout.
4. Calendar and custom excluded dates, visual conflict feedback; do not silently substitute dates.
5. Refactor recurrence into rentals domain service and share one reservation factory with single checkout to reduce future validation/pricing/event drift. Preserve atomic series semantics.
6. Snapshot/quote comparison between preview/create if business wants stable quoted prices. Current code intentionally recalculates and tests changed prices, and charges separately, so do not label as unauthorized charge.

### Test evidence / gaps

Executed here: `docker exec frota-local-715856fc-frontend-1 npm test -- src/features/chat/tests/comms.audit.test.tsx` -> 3 tests passed, 1 file, ~1.9 sec. Characterization tests prove the 3 client defects described above; transports mocked. Copied probe to /tmp, removed temporary app file, git status clean.

Reviewed existing tests, not rerun here (root owns full suite): notifications Django coverage +3 browser tests; recurrence date/access/idempotency/rollback/concurrency coverage +2 browser tests; chat authorization/keyset/unread/moderation/handshake tests +2 browser tests +3 socket hook tests. Existing chat E2E sends two messages and reloads, but never asserts read receipts during active view, >50 history, lost-echo retries, empty-thread reconnect, or dashboard updates.

Recommended minimum new acceptance coverage:
- Visible active conversation marks incoming received messages read, hidden tab does not.
- Read/notification counters remain correct across multiple conversations.
- 120 messages and 60 threads remain accessible by pagination.
- Receive first message while offline, reconnect; recover without reload.
- Commit message then lose acknowledgment; retry remains one DB row and changes failed -> sent.
- Cancel rental while chat open; composer/error explains readonly state.
- Dashboard inbox refreshes preview/new thread without navigation.
- Notification events for refund/amendment/overage after implementation.
- Recurrence resume, occurrence expiry, partial payment and batch cancel policies after product decision.
