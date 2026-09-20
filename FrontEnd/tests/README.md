# Browser tests

These tests exercise the real React app, Django API, PostgreSQL and Redis over
HTTP and WebSocket. Only AI pricing and public geocoding/map services are
intercepted. No Groq, Gemini, Firebase or email keys are required.

## Run locally

From the repository root, start the Docker stack:

```bash
docker compose up --build -d
```

From `FrontEnd`:

```bash
npm ci
npx playwright install
npm run test:e2e                  # Chromium, Firefox and WebKit
npm run test:e2e -- --project=chromium
npm run test:e2e:ui               # interactive runner
npm run test:e2e:report           # HTML report and failure traces
npm run test:e2e:typecheck
npm test                         # existing Vitest tests, separate from E2E
```

The defaults match the retrofit Docker stack: frontend `http://localhost:5174`
and backend `http://localhost:8001/api/`. For the standard Compose ports:

```bash
E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:8000/api/ npm run test:e2e
```

Use `localhost` consistently: authentication restores an HttpOnly refresh cookie,
and chat validates the browser origin. Tests expect the Docker backend service
in this checkout and `DJANGO_DEBUG=true`. They do not start or reset Docker for
you. The GitHub Actions workflow starts its own stack with an empty database.

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

## Test data and cleanup

Each test that needs data gets two unique temporary accounts, two machines, one
posting, a completed historical rental and an initial message. The helper runs `support/seed_django.py` inside
Docker; no test-only HTTP endpoint is added to the application. Fixtures are
removed in teardown even when assertions fail. Existing demo accounts and
announcements are not reset. Each retry and browser gets fresh records.

The fixture script refuses a hosted database. When the main backend is connected
to Supabase, use a separate local backend container and a separate Vite process:

```bash
# From the repository root; the existing local db/redis services must be running.
docker compose --env-file .env -f compose.yaml run --no-deps -d --name frota-e2e-backend --publish 8002:8000 -e DATABASE_URL= -e DB_SCHEMA= -e RUN_MIGRATIONS=false -e FRONTEND_URL=http://localhost:5175 backend python manage.py runserver 0.0.0.0:8000
docker exec frota-e2e-backend python manage.py migrate --noinput
# From FrontEnd, in a separate terminal:
VITE_API_BASE_URL=http://localhost:8002/api/ VITE_WS_BASE_URL=ws://localhost:8002 npm run dev -- --port 5175
# Run the suite against those local services:
E2E_BASE_URL=http://localhost:5175 E2E_API_URL=http://localhost:8002/api/ E2E_BACKEND_CONTAINER=frota-e2e-backend npm run test:e2e
```

`E2E_BACKEND_CONTAINER` selects the container used for fixture creation and
cleanup. It does not change the database of an already running container. Stop
and remove only that temporary container when finished; keep data volumes.
While both backends exist, select containers explicitly with `docker exec`:
Compose service selection can resolve to the temporary one-off container.

AI requests are blocked by a context-level route by default; individual pricing
tests supply deterministic success or error responses. A browser success test
therefore checks the UI/API contract, not the quality of a live AI valuation.
Keep live-provider checks separate from this suite.

If a run is forcibly killed before teardown, its report includes a `fixture-id`
attachment. Remove only those records using the recorded UUID, from the repo root:

```bash
docker compose exec -T backend python - delete THE_FIXTURE_UUID < FrontEnd/tests/support/seed_django.py
```

Reports and traces are ignored by Git. Inspect a trace from the HTML report to
see the screenshot, DOM and network calls for each step. Avoid fixed sleeps;
use accessible locators, Playwright assertions, response events and socket
subscription events as demonstrated in these specs.
