# Browser tests

These tests exercise the real React app, Django API, PostgreSQL and Redis over
HTTP and WebSocket. AI pricing, checkout failures and public geocoding/map
services are intercepted. No Groq, Gemini, Firebase or email keys are required.

## Run locally

From the repository root, start an isolated local Docker stack:

```bash
python3 Devops/dev.py local up
```

Install the browser runner dependencies on the host (Node 22.12+):

```bash
cd FrontEnd
npm ci
npx playwright install
cd ..
python3 Devops/dev.py local e2e    # Chromium, Firefox and WebKit
```

The helper selects the current checkout's local backend container and the
matching frontend/API URLs. If the default ports are occupied, use the same
`--port-offset 2` on both `up` and `e2e` (frontend 5175, API 8002). See the
[development guide](../../Devops/DEVELOPMENT.md) for environment files and modes.

For individual browsers or the interactive runner, set all three target values
explicitly from `FrontEnd` (replace the container name with the local project's
backend shown by `local status`):

```bash
E2E_BACKEND_CONTAINER=YOUR_LOCAL_BACKEND E2E_BASE_URL=http://localhost:5175 E2E_API_URL=http://localhost:8002/api/ npm run test:e2e -- --project=chromium
# Use the same variables with npm run test:e2e:ui for the interactive runner.
npm run test:e2e:report           # HTML report and failure traces
npm run test:e2e:typecheck
npm test                         # Vitest tests, separate from E2E
```

Raw `npm run test:e2e` retains the legacy defaults (frontend 5174, API 8001);
the helper overrides them. Use `localhost` consistently: authentication restores
an HttpOnly refresh cookie, and chat validates the browser origin. Tests require
a local Docker backend and `DJANGO_DEBUG=true`. They do not start Docker for you.
GitHub Actions starts its own disposable stack without live provider keys.

## Coverage

- Login validation, invalid credentials, owner/renter dashboards, session restore,
  and redirecting back to a protected page after login.
- Pricing loading/duplicate-submit protection, explicit apply, owner override,
  source links, real announcement publishing and persisted price.
- Missing market data leaves manual publishing available; provider failure can
  be retried; changing equipment clears the previous suggestion.
- Two isolated browser contexts subscribe to a real chat thread, exchange messages
  over WebSocket, avoid duplicate optimistic bubbles, and reload persisted history.
- Recurrence reuses a historical rental, previews current prices, creates fresh
  unsigned reservations, survives an idempotent retry, and rejects occupied dates
  without creating a partial series. Scheduling does not initiate checkout.
- Notifications reach both parties, refresh automatically, link to the rental,
  preserve read/dismiss actions after reload and reject another recipient's ID.
  Replacing a pending filter aborts its obsolete request without a connection
  error log or alert; the new filter still loads.

- Dashboard fleet/year/status filters, real rental review creation/deletion,
  listing pause/reopen, location preservation and dependent machine-name refresh.
- Account/password changes, operator create/edit/unlink and operator login,
  role routing, deep-link restoration and contract PDF actions.
- Failed checkout recovery reuses the existing reservation on retry and reload.

## Test data and cleanup

Each test that needs data gets two unique temporary accounts, two machines, one
posting, a completed historical rental and an initial message. The helper runs `support/seed_django.py` inside
Docker; no test-only HTTP endpoint is added to the application. Fixtures are
removed in teardown even when assertions fail. Existing demo accounts and
announcements are not reset. Each retry and browser gets fresh records.

The fixture script refuses a hosted database. When the main backend uses
Supabase, run an independent local stack alongside it:

```bash
python3 Devops/dev.py local up --port-offset 2
python3 Devops/dev.py local e2e --port-offset 2
python3 Devops/dev.py local down --port-offset 2
```

This stack has its own local database, files, Redis, ports and cookies. `down`
keeps data volumes. The helper rejects `supabase e2e`, including when a remote
write flag is supplied. Separate worktrees are needed if source edits must also
stay independent.

AI requests are blocked by a context-level route by default; individual pricing
tests supply deterministic success or error responses. A browser success test
therefore checks the UI/API contract, not the quality of a live AI valuation.
Keep live-provider checks separate from this suite.

If a run is forcibly killed before teardown, its report includes a `fixture-id`
attachment. Use `local status` to identify the local backend container. Remove
only those records using the recorded UUID, from the repo root:

```bash
docker exec -i YOUR_LOCAL_BACKEND python - delete THE_FIXTURE_UUID < FrontEnd/tests/support/seed_django.py
```

Reports and traces are ignored by Git. Inspect a trace from the HTML report to
see the screenshot, DOM and network calls for each step. Avoid fixed sleeps;
use accessible locators, Playwright assertions, response events and socket
subscription events as demonstrated in these specs.
