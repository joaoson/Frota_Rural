# Develop merge validation — 2026-09-20

Current integration candidate: `codex/rental-recurrence-supabase`.
Previously validated baseline: `codex/retrofit-pricing-chat-develop`.
Target checked: `origin/develop` at `c44750fccd9e1ce2b1ca9be60451b2e7e15f08b0`.

The candidate already includes that target and adapts pricing, machine readings,
the mascot and chat to its frontend architecture. The original
`feature/sugestao-preco-hora-ia` checkout was preserved, including its uncommitted
changes. That original branch has six merge conflicts with the target; use the
current integration candidate for the T06 and Supabase configuration additions.

The original results below describe the validated baseline. The T06 section at
the end tracks verification of the current changes separately.

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
| `codex/rental-recurrence-supabase` | Current candidate | Inherits the reviewed retrofit, adds T06 and optional Supabase configuration |

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

With the retrofit Docker stack running, from the repository root:

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

**Live Supabase status:** connected through the session pooler with TLS. The user
prepared the private schema; all 46 Django migrations were then applied to the
empty schema. The running Docker backend now uses Supabase, with 26 tables in
`frota_rural`, none in `public`, and no pending migrations. Neither `anon` nor
`authenticated` can read the application tables. Frontend and public listings
requests returned HTTP 200; an anonymous private rentals request returned 401.
Groq remains configured. Existing local users, listings and rentals were not
copied. See the [Supabase setup guide](../Devops/SUPABASE.md) for startup and
switching back to local development.

### Current verification

These results include the final recurrence, payment, access-control and database
configuration changes. External payments and AI responses remain simulated.

| Check | Current result |
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
