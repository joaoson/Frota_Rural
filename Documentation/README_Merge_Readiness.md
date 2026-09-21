# Develop merge validation — 2026-09-20

Current integration candidate: `codex/fix-notification-cancellation`.
Previously validated baseline: `codex/retrofit-pricing-chat-develop`.
Target checked: `origin/develop` at `c44750fccd9e1ce2b1ca9be60451b2e7e15f08b0`.

The candidate already includes that target and adapts pricing, machine readings,
the mascot and chat to its frontend architecture. The original
`feature/sugestao-preco-hora-ia` checkout was preserved, including its uncommitted
changes. That original branch has six merge conflicts with the target; use the
current integration candidate for T05, T06 and the Supabase configuration.

The original results below describe the validated baseline. The T06 and T05
sections track each delivery separately; the final section records current results.

## Branch comparison

Remote refs were refreshed on 2026-09-20. Commit dates alone do not identify the
best integration base: the original AI feature tip is newer than the original
retrofit tip, but the retrofit already includes the current develop architecture.

| Reference | Observed tip | Relevant differences |
| --- | --- | --- |
| `origin/develop` | `c44750f`, 2026-09-05 | Refactored frontend architecture; integration target |
| `feature/sugestao-preco-hora-ia` | `7a09e4e`, 2026-09-09 21:41 -03 | Original AI/mascot feature; six conflicts against develop; user edits preserved separately |
| `origin/codex/retrofit-pricing-chat-develop` | `8ccbb39`, 2026-09-09 21:27 -03 | Docker/Groq implementation adapted to develop, with chat and browser tests |
| Local retrofit baseline | `e06bcfb`, 2026-09-20 | Adds review fixes to that Docker/Groq implementation |
| `codex/rental-recurrence-supabase` | `9f59e4b` | Inherits the reviewed retrofit, adds T06 and the live Supabase connection |
| `codex/rental-notifications` | `2696628` | Adds T05 notifications and safe, repeatable Supabase demo data |
| `codex/fix-pricing-research` | `1e0b6bf` | Preserves original search evidence and labels estimates when new-equivalent prices are unavailable |
| `codex/fix-notification-cancellation` | Current candidate | Distinguishes canceled notification requests from connection failures |

The running `frota_rural_retrofit` Docker stack mounts this checkout, with the
frontend on port 5174 and backend on port 8001. Its configured pricing provider
is Groq. The older `origin/codex/containerize-development` tip is `4e779ed` from
2026-09-02 and is not the latest integrated application.

## Bugs fixed during review

- Expired bearer tokens now return HTTP 401 so the frontend can refresh them;
  login, refresh and logout are not blocked by a stale Authorization header.
- Rejected WebSocket authentication delivers close code 4401 over the actual
  browser transport. Reconnection attempts refresh only once before logout.
- Local API and WebSocket addresses consistently use the page hostname, avoiding
  refresh-cookie loss when switching between localhost and 127.0.0.1.
- Machine form submissions preserve multipart data while normalizing RENAGRO.
- Equipment editing waits for the server, retains input on failure, prevents
  duplicate saves and discards cancelled changes when reopening the same item.
- Announcement photo selection copies the files before the input is cleared.
- Pricing rejects invalid numeric inputs, unsafe JSON and implausible final
  prices before persistence. Market adjustments are included in the breakdown
  so its components sum to the displayed price, including discounts.

Regression tests cover these cases. Existing coverage also checks stale pricing
responses after changing machines, manual price overrides, real announcement
creation and chat delivery/history.

## Baseline results

| Check | Result |
| --- | --- |
| Django regression suite (PostgreSQL) | 102 passed |
| Frontend unit/component suite | 25 passed |
| Browser suite | 36 passed across Chromium, Firefox and WebKit |
| ESLint, production build, E2E TypeScript check | Passed |
| Django checks and migration drift | Passed; no pending model changes |
| Python dependency consistency | No broken requirements |
| Merge simulation and whitespace checks | Passed; no conflicts |

## Reproduction

Use the local PostgreSQL stack for automated tests. If the main backend currently
uses Supabase, follow the [isolated test setup](../FrontEnd/tests/README.md) and
substitute `docker exec frota-e2e-backend` for `docker compose exec -T backend`
below. Check the selected container's database before running tests.

From the repository root:

```sh
docker compose exec -T backend python manage.py check
docker compose exec -T backend python manage.py makemigrations --check --dry-run
docker compose exec -T backend python manage.py test --noinput
docker compose exec -T backend python -m pip check
git merge-tree --write-tree origin/develop HEAD
git diff --check origin/develop...HEAD
```

From `FrontEnd`:

```sh
npm run lint
npm run build
npm test
npm run test:e2e:typecheck
npm run test:e2e
```

The browser suite uses the running development stack with isolated temporary
fixtures and cleanup; the Django suite creates and destroys its own test
database. The CI workflow now runs backend checks and regressions alongside
frontend and browser tests.

## Limits

External AI providers and geocoding are simulated in automated tests; live
provider availability and valuation quality are not certified by this review.
The production frontend build reports a large-bundle warning. Recheck the merge
if `develop` advances beyond the commit recorded above.

## T06 recurrence and Supabase configuration

The current candidate adds finite weekly, biweekly and monthly rental series,
with 2–12 new reservations based on an existing rental. Preview and creation
use current server prices and validate availability. Creation is atomic and
idempotent, with PostgreSQL row locks shared by the single-booking and payment
paths. Each occurrence receives a new unsigned contract and an initial
30-minute hold; payment remains separate for each reservation.

Checkout renews the hold to its session expiry. A delayed payment confirmation
that cannot safely confirm its rental becomes `requires_review`; the return
screen directs the user to support without requesting another payment. The
implementation and its limits are documented in
[T06 — Programar Recorrência de Aluguel](README_Recorrencia_Aluguel.md).

The review also closes rental ownership and payment-state bypasses: rental and
contract reads are scoped to their parties, identities cannot be reassigned,
signature requires an approved payment, and rental writes share the availability
locks. Different advertisements of the same machine share their occupied dates.
Checkout confirms only paid Stripe events and blocks another checkout while a
payment awaits manual review. Browser recovery preserves pending payment return
parameters across refresh and handles closed historical rentals.

Supabase configuration supports a PostgreSQL `DATABASE_URL`, required encryption
and a dedicated private schema. A separate ignored environment file and Compose
override preserve the existing local Docker/Groq workflow. Hosted startup
migrations are disabled. The connection verifier only reads database metadata
and omits passwords and driver errors containing connection details.

**Supabase status at T06 delivery:** connected through the session pooler with TLS. The user
prepared the private schema; all 46 Django migrations were then applied to the
empty schema. The running Docker backend now uses Supabase, with 26 tables in
`frota_rural`, none in `public`, and no pending migrations. Neither `anon` nor
`authenticated` can read the application tables. Frontend and public listings
requests returned HTTP 200; an anonymous private rentals request returned 401.
Groq remains configured. Existing local users, listings and rentals were not
copied. See the [Supabase setup guide](../Devops/SUPABASE.md) for startup and
switching back to local development.

### T06 verification at delivery

These results include the final recurrence, payment, access-control and database
configuration changes. External payments and AI responses remain simulated.

| Check | T06 result |
| --- | --- |
| Full Django suite, including recurrence, payments and database configuration | 182 passed on PostgreSQL, including concurrent booking and signature tests |
| Frontend unit/component suite, including recurrence and payment review | 43 passed |
| Browser suite across Chromium, Firefox and WebKit | 42 passed; all 6 recurrence scenarios passed again after the final access/calendar fixes |
| Frontend lint, production build and E2E TypeScript | Passed; existing large-bundle warning remains |
| Django checks, migration drift and dependency consistency | Passed; no missing migrations or broken dependencies |
| Fresh migrations into an isolated private PostgreSQL schema | Passed locally: 26 private tables, zero public tables; temporary database removed |
| Default and Supabase Compose configuration | Passed locally; default stays on local PostgreSQL/Redis, override disables hosted startup migrations |
| Merge simulation against current `develop` and whitespace checks | Passed; latest fetched `origin/develop` is already an ancestor, with no conflicts |
| Live Supabase connection and remote migrations | Passed: TLS, 46 applied migrations, 26 private tables, no pending migrations, running API smoke checks passed |

Focused reproduction on the local Docker stack:

```sh
docker compose exec -T backend python manage.py test api.test_recurrence api.test_rental_access contracts.test_signature_access payments.tests djangoapi.test_database_config api.test_database_commands --noinput
```

Run the full commands in **Reproduction** for the final review. Use the local
configuration for test runs; do not target the user's Supabase project. The
recurrence migrations add schema only and do not transfer existing local data.

## T05 notifications and populated Supabase

T05 adds persistent in-app notifications for rental changes, payment updates and
contract signatures. Both parties have private inboxes with read/unread state,
mark-all, dismissal, filters, pagination and links to the affected rental or
contract. The UI refreshes every 30 seconds while visible and on window focus.
Events share the business transaction and stable event keys prevent duplicates
on retries, including after dismissal. See the
[T05 implementation](README_Notificacoes_Locacao.md).

The seed uses stable IDs and a transaction, preserves existing edits and refuses
identifier collisions. Its explicit remote option was used with the user's
authorization. Supabase now contains 88 demo records: 6 accounts, 20 machines,
20 listings, 8 rentals, 4 unsigned/cancelled contracts, 8 messages, 4 reviews,
2 pending certifications and 16 notifications. A second dry run found zero new
records and preserved all 88. Demo credentials and scope are in the
[seed guide](../Devops/SEED.md). Existing local data was not imported.

The notification migration brings the live private schema to **47 applied
migrations and 27 tables**, with none in `public` and no pending migrations.
TLS and the absence of table SELECT privileges for `anon` and `authenticated`
were verified again. Hosted fixtures were not used for automated test suites.

### T05 verification at delivery

| Check | Result |
| --- | --- |
| Full Django suite on local PostgreSQL | 211 passed, including 22 notification tests and 8 seed safety tests |
| Frontend unit/component suite | 54 passed |
| Full browser suite across Chromium, Firefox and WebKit | 48 passed |
| Frontend lint, production build and E2E TypeScript | Passed; existing large-bundle warning remains |
| Django checks, migration drift and dependency consistency | Passed; no missing migrations or broken requirements |
| Seed on Supabase and repeat dry run | Passed: 88 created, then zero to create and 88 preserved |
| Live browser checks against Supabase | Owner and tenant demo logins passed; each inbox displayed its 4 persisted notifications |
| Merge compatibility | Latest fetched `origin/develop` remains `c44750f` and is already an ancestor; merge simulation passes |
| Independent final code review | No additional actionable findings |

Notifications are delivered inside the app. External payment/AI providers remain
simulated in regression tests; no real charge, email or push delivery is certified.

## Pricing failure reproduced and fixed

The live Groq path reproduced the S790 failure: the Compound summary mislabeled
a used listing as new and the extractor returned a range without a usable used
price. Extraction now receives the original query and bounded source snippets,
preserving condition, operating hours and location. Only cited URLs present in
the supplied evidence survive. Empty generated prose no longer discards valid
search results, and the adapter does not retry or switch providers.

The user chose an explicit estimate when a new-equivalent price is unpublished.
The deterministic fallback uses a disclosed 10% annual depreciation assumption,
with a 40% retained-value floor, and low confidence. The UI shows both values and
the formula before application. Research cache keeps the missing new price null;
the suggestion audit stores the estimate separately. Missing sourced used prices,
invalid inputs and implausible results still return 422.

### Pricing verification at delivery

| Check | Result |
| --- | --- |
| Full Django suite on isolated local PostgreSQL | 227 passed |
| Frontend unit/component suite | 57 passed |
| Pricing browser suite, Chromium/Firefox/WebKit | 15 passed, including explicit estimate display and application |
| Frontend lint, build and E2E TypeScript | Passed; existing bundle-size warning remains |
| Django system check and migration drift | Passed; no migration needed |
| Live Groq → Supabase → browser | S790 2023 returned HTTP 200 and R$3,103.17 per billed hour; estimate label/assumptions verified |
| Merge base | Latest fetched `origin/develop` remains `c44750f`, already included |

The live result used the observed R$2,700,000 used-machine listing and a calculated
R$3,703,703.70 replacement estimate, with 3 years of age and retention 0.729. These
are validation inputs/results, not certification of a market rental rate. No
listing was published during the live smoke check. Automated tests used local
databases and simulated external providers.

## Notification cancellation classified as a network error

Changing filters or unmounting a notification query legitimately aborts its HTTP
request. Axios reports `CanceledError`, but the shared adapter previously mapped
every Axios error without a response to `NetworkError`, causing false connection
error logs. Both an adapter/query test and a Chromium test reproduced that exact
message before the fix.

The client now represents Axios and native aborts as `RequestCanceledError`,
propagates cancellation without error logging and disables retries for it.
Abort signals, notification queries and authentication refresh remain intact.
Real network errors still log and retain their existing retry policy.

### Current verification

| Check | Result |
| --- | --- |
| Frontend unit/component suite | 62 passed, including 5 HTTP cancellation regressions |
| Notification and authentication browser suites | 27 passed across Chromium, Firefox and WebKit |
| Live Supabase-backed app | Obsolete filter canceled quietly; replacement request returned HTTP 200 and rendered without an error alert |
| ESLint, production build and E2E TypeScript | Passed; existing bundle-size warning remains |
| Independent review | No blocking findings; real network errors and shared token refresh remain supported |

The backend was unchanged; its preceding full regression run remains 227 passed.
Browser fixtures use an isolated local database, never Supabase.
