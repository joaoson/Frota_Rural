# Develop merge validation — 2026-09-20

Merge candidate: `codex/retrofit-pricing-chat-develop`.
Target checked: `origin/develop` at `c44750fccd9e1ce2b1ca9be60451b2e7e15f08b0`.

The candidate already includes that target and adapts pricing, machine readings,
the mascot and chat to its frontend architecture. The original
`feature/sugestao-preco-hora-ia` checkout was preserved, including its uncommitted
changes. That original branch has six merge conflicts with the target; use the
retrofit branch as the integration candidate.

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

## Results

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
