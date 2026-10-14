# Branch audit and renaming — 2026-10-14

Branch at audit: `develop_joaofre_locacoes_integradas`, committed tip `3f3dfe03cfc8c7710b1b63f785d988566b8eb2fa`. Origin was fetched before comparison. These commit counts describe that snapshot, before the subsequent CI/database-selection and Groq error-message changes.

## Result

No missing committed application feature was found in the older branches. All former Codex tips are ancestors of the current commit. Other branches are either ancestors, historical release merge records, or older implementations whose features have already been ported into the current architecture.

The useful uncommitted improvement found in the original checkout—actionable Groq failure messages—has now been ported into the current branch with regression coverage. The original checkout remains untouched. No older branch or checkout was deleted.

## Names changed

The existing `develop_joaofre_...` convention was applied to all eight local Codex branches. The three that existed on GitHub were renamed there as well; the other five remain local-only. Local and remote commit IDs, existing ahead/behind differences, and upstream tracking were preserved.

| Previous name | Current name | Scope |
| --- | --- | --- |
| `codex/containerize-development` | `develop_joaofre_docker` | Local + GitHub |
| `codex/dashboard-flow-audit` | `develop_joaofre_fluxos_dashboard` | Local only |
| `codex/develop-rental-features` | `develop_joaofre_locacoes_integradas` | Local + GitHub |
| `codex/fix-notification-cancellation` | `develop_joaofre_correcao_notificacoes` | Local only |
| `codex/fix-pricing-research` | `develop_joaofre_correcao_precificacao` | Local only |
| `codex/rental-notifications` | `develop_joaofre_notificacoes` | Local only |
| `codex/rental-recurrence-supabase` | `develop_joaofre_recorrencia_supabase` | Local only |
| `codex/retrofit-pricing-chat-develop` | `develop_joaofre_precificacao_chat` | Local + GitHub |

The active pull request is [#44](https://github.com/joaoson/Frota_Rural/pull/44), against `develop`, at the same committed tip and with the same feature description as [#43](https://github.com/joaoson/Frota_Rural/pull/43). GitHub automatically closed #43 after its source branch was renamed; #44 links that record. There were no reviews, comments, labels, assignees or requested reviewers to migrate. See [GitHub’s documented rename behavior](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-branches-in-your-repository/renaming-a-branch).

## Local branches

“Unique” counts commits only on that branch; “behind” counts commits only on the current integration branch. Different hashes do not necessarily mean missing code.

| Local branch | Unique | Behind | Assessment |
| --- | ---: | ---: | --- |
| `develop` | 0 | 20 | Fully included |
| `develop_joaofre_correcao_notificacoes` | 0 | 5 | Fully included |
| `develop_joaofre_correcao_precificacao` | 0 | 6 | Fully included |
| `develop_joaofre_docker` | 0 | 28 | Fully included |
| `develop_joaofre_fluxos_dashboard` | 0 | 3 | Fully included |
| `develop_joaofre_fotos_firebase` | 0 | 39 | Fully included |
| `develop_joaofre_locacoes_integradas` | 0 | 0 | Current candidate |
| `develop_joaofre_notificacoes` | 0 | 7 | Fully included |
| `develop_joaofre_precificacao_chat` | 0 | 10 | Fully included |
| `develop_joaofre_recorrencia_supabase` | 0 | 8 | Fully included |
| `feature/sugestao-preco-hora-ia` | 4 | 17 | Features ported; original working directory has uncommitted work |
| `main` | 9 | 45 | Historical merge records; source code already included |

## GitHub branches and content evidence

| Branch | Ahead | Behind | Result |
|---|---:|---:|---|
| `origin/develop` | 0 | 15 | Fully contained (ancestor) |
| `origin/develop_amanda_rf5` | 0 | 102 | Fully contained (ancestor) |
| `origin/develop_amanda_t01_pagamento` | 0 | 29 | Fully contained (ancestor) |
| `origin/develop_joaofre_docker` | 0 | 23 | Fully contained (ancestor) |
| `origin/develop_joaofre_fotos_firebase` | 0 | 31 | Fully contained (ancestor) |
| `origin/develop_joaofre_locacoes_integradas` | 0 | 0 | Fully contained (ancestor) |
| `origin/develop_joaofre_precificacao_chat` | 0 | 11 | Fully contained (ancestor) |
| `origin/develop_joaofre_rf3` | 0 | 141 | Fully contained (ancestor) |
| `origin/develop_joaofre_rf3_2` | 0 | 136 | Fully contained (ancestor) |
| `origin/develop_joaofre_rf4` | 0 | 115 | Fully contained (ancestor) |
| `origin/develop_joaofre_rf4_2` | 1 | 74 | Legacy implementation already represented by current architecture; see details below |
| `origin/docs` | 0 | 185 | Fully contained (ancestor) |
| `origin/feature/sugestao-preco-hora-ia` | 4 | 17 | Legacy implementation already represented by current architecture; see details below |
| `origin/hotfix` | 0 | 176 | Fully contained (ancestor) |
| `origin/main` | 9 | 45 | Merge metadata only; every unique merge has the same tree as its second parent |
| `origin/release` | 4 | 45 | Merge metadata only; every unique merge has the same tree as its second parent |

## Non-ancestor details

### `origin/main`, `origin/release`

Main has 9 unique merge commits (`c2316cb`, `63fe8ba`, `a86f0ca`, `1dc7c12`, `93fb70c`, `d98f912`, `206dadd`, `0775a29`, `a2b874d`); release has 4 of those. For every unique merge, `git diff --quiet COMMIT^2 COMMIT` succeeds: its tree exactly matches the source branch at merge time. Those source changes are already in current develop ancestry. `git cherry BASE BRANCH` has no entries. No missing code from main/release was found.

### `origin/develop_joaofre_rf4_2`

Unique commit: `b01686d501e45ce195b88e997dd474bdb43239a5` (Finished Review Service). Git cherry marks it `+` because the old patch is not byte-equivalent after refactoring. Functional review:

- Original `BackEnd/api/{serializer,urls,views}.py` review CRUD is present in current `BackEnd/reviews/{serializer,urls,views,services}.py`. Current writes require authentication and reviewer ownership; the old CRUD would regress those protections.
- Original dashboard received/given review lists and create/delete actions are in `FrontEnd/src/features/dashboard/components/ReviewsSection.tsx`, `features/reviews/{api,hooks}`, and `pages/dashboard/Dashboard{Locador,Locatario}.tsx`. Current pagination is functional, unlike the old no-op callbacks.
- Role-aware login, account menu, route authorization and session state are present in current `components/{Navbar,ProtectedRoute}.tsx`, `contexts/AuthContext.tsx`, and `features/auth/hooks/useLogin.ts`.
- Password visibility is centralized in `shared/components/PasswordField.tsx`, used by auth pages and dashboard `AccountSection.tsx`.
- Mobile sidebar behavior lives in current `features/dashboard/components/DashboardShell.tsx`.
- MaterialIcon HTML span attributes/custom styles remain supported; current adds decorative accessibility defaults.
- Only absent standalone file: `BackEnd/test_jwt.py`, an ad hoc diagnostic script using `DJANGO_SETTINGS_MODULE=frota_rural.settings`, querying the first user, and printing JWT role claims. It is not a feature or proper automated regression test and should not be restored to this architecture.

Recommendation: do not merge/cherry-pick this old monolithic commit. No missing application feature identified.

### `origin/feature/sugestao-preco-hora-ia`

Unique original commits: `97907c0` (algorithm documentation), `a3dbec7` (pricing backend), `7465a3c` (pricing form UI), `7a09e4e` (interactive capybara). Original commit hashes are absent, but features were ported into `9131c43` and extended by later commits.

- Identical blobs for `BackEnd/pricing/engine.py`, pricing models/initial migration, machine power/hour-meter migration, and `Database/schema.sql` establish that the deterministic algorithm and original schema survived.
- Current pricing implementation additionally includes Groq/Gemini adapters, sourced pricing evidence, explicitly labeled replacement estimates, stricter validation and regression tests (`BackEnd/pricing/test_{estimates,gemini,groq}.py`).
- The suggestion panel is now `FrontEnd/src/features/pricing/components/SugestaoPrecoPanel.tsx`, with injected repository/store/hook and `pages/postings/NovoAnuncio.tsx` integration.
- Power/hour-meter fields are present in `pages/machines/NovoEquipamento.tsx`, `components/EditEquipamentoModal.tsx`, and `features/machines/{api,types}` with bounds and zero-versus-empty tests.
- The same capybara sprite blob remains at `FrontEnd/public/mascot/capivara-3d-poses.png`; the homepage companion moved to `features/home/components/MascotCompanion.tsx`, now using shared `shared/components/Capybara.tsx`. The original gestures/guidance remain and link to the newly implemented help page.
- Original pricing/mascot documentation survives with architecture/provider updates.
- Only additional absent content is `.agents/skills/ip-as-logo/` (optional design-agent skill instructions, README/license and sample image). This is authoring support, not app runtime. Keep the source branch as an archive if needed; no reason to merge its old app implementation.

Recommendation: no application code to import. Preserve original branch until the owner explicitly chooses branch cleanup/deletion.

## Uncommitted work that must be retained

### Original `Frota_Rural` checkout

Location on this Mac: `/Users/joaovitordefreitas/Documents/CodingProjects/FrotaRuralSegundo/Frota_Rural`, branch `feature/sugestao-preco-hora-ia`.

- `BackEnd/pricing/research.py:306–323` maps Groq HTTP 429, 413, 401 and 403 to sanitized `ResearchUnavailable` messages (rate limit, oversized request, and configuration/key failures).
- `BackEnd/pricing/service.py:205–210` passes that message into `SuggestionUnavailable` for the caller.
- Coverage is in the untracked `BackEnd/pricing/test_research.py` and modified `BackEnd/pricing/tests.py`.
- Ported the error-message behavior into the current `BackEnd/pricing/research.py` and `service.py`, retaining explicit provider selection and the existing HTTP 422 response contract. Quota errors advise trying again later or entering a manual price, without promising a fixed retry interval. The current adapter, source validation and lack of automatic retries/provider fallback are preserved.
- Current coverage in `BackEnd/pricing/test_groq.py` exercises both search and extraction failures, sanitized messages/logs and generic handling for other HTTP errors. `BackEnd/pricing/tests.py` verifies the service/API response, no failed valuation/suggestion writes, and successful manual posting afterward.
- Other authentication refresh, role restoration, loopback API/WebSocket and Groq sourcing changes are already included or superseded.
- The untracked `brag-output/` video/assets are distinct local artifacts, not obsolete application source. Preserve them.

### `Frota_Rural_retrofit` checkout

Location on this Mac: `/Users/joaovitordefreitas/Documents/CodingProjects/FrotaRuralSegundo/Frota_Rural_retrofit`, renamed branch `develop_joaofre_fluxos_dashboard`. All 18 changed/untracked frontend source and test files for the capybara, footer, public pages and browser coverage match current files byte-for-byte. This checkout still has local working files and runs the existing Supabase app.

Both older working directories remain dirty. Branch ancestry alone is not permission to remove or reset their working files.

## Verification and next steps

- Compared ancestry, unique commits, patch equivalence and source content; inspected merge trees for `main` and `release`.
- Verified every renamed local/remote tip kept its original SHA. Worktree diffs and untracked file contents were hashed before/after the rename and matched.
- Verified no `codex/*` local or GitHub branch refs remain, and current upstream points to `origin/develop_joaofre_locacoes_integradas`.
- Verified the renamed branch still resolves to local PostgreSQL through `Devops/dev.py config --port-offset 2`.
- The initial branch audit changed only branch/documentation metadata. It ran no data migration and retained the older branches.
- Follow-up completed: ported the specific uncommitted Groq error messages alongside the newer CI/database-selection work. All 72 pricing tests passed on the isolated local Docker database, with simulated provider responses and no external AI calls. Before publishing, the full 378-test Django suite and all 19 development-helper tests also passed.
