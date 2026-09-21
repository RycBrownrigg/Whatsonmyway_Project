---
phase: 01-admin-pack-authoring-build
plan: 01
subsystem: admin-walking-skeleton
tags: [admin, api, auth, fastify, nextjs, drizzle, vitest, walking-skeleton]
dependency-graph:
  requires: []
  provides:
    - api/src/db/client.ts (db, sql)
    - api/src/middleware/adminAuth.ts (adminAuthPreHandler)
    - api/src/routes/admin/index.ts (registerAdminRoutes)
    - api/src/routes/admin/packs.ts (registerPackRoutes, CreatePackSchema)
    - api/src/routes/admin/fields.ts (registerFieldRoutes, CreateFieldSchema)
    - api/src/server.ts (buildApp)
    - api/test/setup.ts (testDb, resetDb, buildTestApp, ADMIN_TOKEN_FOR_TESTS)
    - admin/lib/api.ts (apiCall, packApi, setAdminToken, getAdminToken, clearAdminToken)
  affects:
    - api/src/server.ts (Fastify constructor, CORS, redact)
    - api/tsconfig.json (rootDir removed, test/**/*.ts included)
    - api/package.json (test/typecheck scripts, start script path)
tech-stack:
  added:
    - vitest ^5.0.1 (api devDependency)
    - "@fastify/cors ^11.3.0 (api dependency)"
    - Next.js 16.3.5 + React 19.2.8 (admin/, static export)
    - shadcn CLI v4.21.0 (radix base, custom preset code b2hE)
    - "@tanstack/react-query ^5, react-hook-form ^7, @hookform/resolvers ^5, sonner ^2, lucide-react ^1 (admin/)"
  patterns:
    - Single Drizzle client module (api/src/db/client.ts), bound to DATABASE_URL at import time
    - Fastify preHandler auth boundary installed once at plugin scope (api/src/routes/admin/index.ts)
    - timingSafeEqual constant-time bearer token comparison with explicit length guard
    - Static-export admin routing via query params + useSearchParams() inside Suspense (no [id] segments)
    - Vitest integration tests against a real wowm_test Postgres database (no mocking of Drizzle)
key-files:
  created:
    - api/src/db/client.ts
    - api/src/middleware/adminAuth.ts
    - api/src/routes/admin/index.ts
    - api/src/routes/admin/packs.ts
    - api/src/routes/admin/fields.ts
    - api/src/routes/admin/packs.test.ts
    - api/src/routes/admin/fields.test.ts
    - api/test/setup.ts
    - api/vitest.config.ts
    - admin/ (entire app — scaffolded via create-next-app + shadcn init)
    - admin/lib/api.ts
    - admin/app/providers.tsx
    - admin/app/page.tsx
    - admin/app/packs/page.tsx
    - admin/app/packs/detail/page.tsx
    - admin/.env.local.example
  modified:
    - api/src/server.ts
    - api/package.json
    - api/tsconfig.json
    - api/.env.example
    - admin/.gitignore
    - admin/next.config.ts
    - admin/app/layout.tsx
    - .planning/phases/01-admin-pack-authoring-build/01-UI-SPEC.md
decisions:
  - "Custom shadcn v4 preset code (b2hE: style=nova, baseColor=neutral, radius=small, font=geist, base=radix) substitutes for the plan's now-obsolete 'style: new-york' instruction — the shadcn CLI installed at execution time no longer has a new-york/default style grammar"
  - "api/tsconfig.json rootDir removed (was 'src') because api/test/setup.ts lives outside it and is imported by co-located *.test.ts files; api/package.json 'start' script updated to dist/src/server.js to match the resulting build output layout"
  - "api/test/setup.ts routes the shared db client at the test database by setting process.env.DATABASE_URL/ADMIN_API_TOKEN before a dynamic import() of server.ts — static imports are hoisted and would run before any env var assignment, which would otherwise silently point tests at whatever DATABASE_URL a developer has in api/.env"
metrics:
  duration: "~90 minutes (spans a checkpoint pause for package-legitimacy approval)"
  completed: "2026-09-21"
status: complete
actuals:
  tokens: 78000
  tasks: 3
  commits: 0
---

# Phase 1 Plan 1: Admin Walking Skeleton Summary

Stood up the `admin/` Next.js static-export app for the first time, gave the API its first
authenticated route surface beyond `/healthz`, and proved the full round trip — sign in, create a
pack, add a framework field — through real HTTP, real Fastify auth, real Drizzle, and a real
Postgres integration test database.

## What Was Built

- **`api/src/db/client.ts`** — the one place a Postgres connection is opened; throws clearly if
  `DATABASE_URL` is unset.
- **`api/src/middleware/adminAuth.ts`** — the D-01 shared bearer-token `preHandler`: 500 if
  `ADMIN_API_TOKEN` is unset, 401 for a missing/malformed header, 403 for a wrong token, using
  `timingSafeEqual` with an explicit length guard so unequal-length tokens never reach the
  constant-time comparison (which throws on length mismatch).
- **`api/src/routes/admin/index.ts`** — the single Fastify plugin that installs the auth
  `preHandler` once and registers every admin route module, so no future route can accidentally
  land outside the authenticated scope.
- **`api/src/routes/admin/packs.ts`** — `POST/GET /v1/admin/packs`, `GET /v1/admin/packs/:id`,
  Zod-validated, Drizzle query builder only, `23505` mapped to 409.
- **`api/src/routes/admin/fields.ts`** (ADMINFW-01) — `POST /v1/admin/packs/:id/framework/fields`,
  with the `fieldKey` regex (`^[a-z][a-z0-9_]{0,63}$`) blocking dangerous JSONB object keys.
- **`api/src/server.ts`** — `buildApp()` factory (separated from the `listen()` call so tests never
  bind a port), `@fastify/cors` with an explicit `ADMIN_ORIGIN` (never a wildcard), Fastify logger
  `redact: ['req.headers.authorization']`.
- **`api/test/setup.ts` + `vitest.config.ts`** — `testDb`/`resetDb`/`buildTestApp` against a real
  `wowm_test` database (created on first run, migrated via `drizzle-orm`'s migrator,
  `fileParallelism: false` since suites share one database).
- **`api/src/routes/admin/packs.test.ts`** — the end-to-end tracer test (create + list) plus the
  full auth-boundary negative suite (missing header → 401, wrong scheme → 401, wrong token → 403,
  truncated token → 403, unset `ADMIN_API_TOKEN` → 500, `/healthz` still open with no header).
- **`api/src/routes/admin/fields.test.ts`** — writes a field definition and reads it back via
  `testDb` (not just the HTTP response), plus 400/409 validation cases.
- **`admin/`** — scaffolded via `create-next-app` (TypeScript, ESLint, Tailwind, App Router, no
  `src/`, `@/*` alias) then `shadcn init`; `output: 'export'`; no dynamic path segments (pack
  detail lives at `/packs/detail?id=<uuid>`, read via `useSearchParams()` inside a `<Suspense>`
  boundary).
- **`admin/lib/api.ts`** — `localStorage`-backed token helpers guarded by `typeof window`, and
  `apiCall`/`packApi` throwing a typed `ApiError` (status + code) on non-2xx.
- **Sign-in (`app/page.tsx`)**, **pack list + create (`app/packs/page.tsx`)**, **pack detail +
  single field row (`app/packs/detail/page.tsx`)** — wired to TanStack Query, React Hook Form +
  Zod, sonner toasts, per 01-UI-SPEC.md's copywriting and color contracts.

## Verification

- `npm --prefix api test` — **2 test files, 11 tests, all passing** (tracer + 5 auth-boundary
  cases + 4 ADMINFW-01 field cases + duplicate-key 409), re-run twice to confirm idempotency.
- `npm --prefix api run typecheck` — clean.
- `npm --prefix api run build` — clean (`tsc -p tsconfig.json`).
- `npm --prefix admin run typecheck` — clean.
- `npm --prefix admin run build` — clean; `admin/out/` emitted with `index.html`, `packs.html`,
  `packs/detail.html` and no bracketed dynamic-segment directories anywhere under `admin/app/`.
- Manual smoke script (not committed) exercised the exact human-check scenarios end-to-end via
  `app.inject()`: no-auth → 401, wrong token → 403, create pack → 201, add field → 201 with the row
  read back, `/healthz` → 200 with no Authorization header. All matched expectations. A live
  browser walkthrough (the plan's `<human-check>`) was not performed — `human_verify_mode` is
  `end-of-phase` and auto-chain mode was active, so per the executor's tracer-feedback-gate rule
  only the automated `<verify>` commands above were required to pass before continuing; a human
  should still confirm the four browser steps in 01-01-PLAN.md's `<human-check>` before shipping
  this phase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `api/tsconfig.json` `rootDir: "src"` conflicted with `api/test/setup.ts`**
- **Found during:** Task 2, first `npm run typecheck`
- **Issue:** `packs.test.ts` imports `../../../test/setup.ts`, which lives outside the configured
  `rootDir: "src"` — TypeScript refused to compile with `error TS6059`.
- **Fix:** Removed the `rootDir` restriction (TypeScript now infers it as the common ancestor of
  `src/` and `test/`) and added `test/**/*.ts` to `include`. Updated `api/package.json`'s `start`
  script from `dist/server.js` to `dist/src/server.js` to match the resulting build output layout.
- **Files modified:** `api/tsconfig.json`, `api/package.json`
- **Commit:** not committed — see "Git Commits Not Run" below

**2. [Rule 3 - Blocking issue] `admin/.gitignore`'s generated `.env*` rule would have silently dropped `admin/.env.local.example`**
- **Found during:** Task 2, staging files for commit
- **Issue:** `create-next-app`'s default `.gitignore` has a blanket `.env*` ignore with no
  exception for `.env.example`-style files (unlike the repo root `.gitignore`, which has
  `!.env.example`). `git status` and `git add` silently omitted `admin/.env.local.example` even
  though it's part of this plan's required artifact list.
- **Fix:** Added `!.env.local.example` to `admin/.gitignore`. Verified with `git check-ignore -v`
  and `git status --short` that the file is now tracked as untracked-and-addable rather than
  silently ignored.
- **Files modified:** `admin/.gitignore`

**3. [Rule 3 - Blocking issue] `shadcn` CLI v4 replaced the `style`/`baseColor` init grammar entirely**
- **Found during:** Task 2, running `npx shadcn init`
- **Issue:** The plan and 01-UI-SPEC.md specify `style: new-york`, `base color: neutral`. The
  installed CLI (shadcn v4.21.0) no longer accepts a `--style`/`--base-color` flag pair; it uses
  named presets (`nova, vega, maia, lyra, mira, luma, sera, rhea`) plus a `--base` (component
  library: `base`/`radix`/`aria`) choice, encoded/decoded as opaque preset codes.
- **Fix:** Per 01-UI-SPEC.md's own contingency ("generate the equivalent preset string... if the
  CLI prompts for one"), built a custom preset code via the CLI's own `encodePreset` function:
  `baseColor: neutral` (direct match), `style: nova` (the CLI's own default — no named style maps
  to "new-york"), `radius: small` (preserves the "denser layout" rationale), `font: geist`,
  `iconLibrary: lucide`, `base: radix` (matches 01-UI-SPEC's "Radix UI primitives" line). Preset
  code `b2hE`. Ran `npx shadcn info` and pasted the real output into 01-UI-SPEC.md's Component
  Inventory provenance line, replacing the "could not enumerate" placeholder, as the plan required.
- **Files modified:** `.planning/phases/01-admin-pack-authoring-build/01-UI-SPEC.md`

**4. [Rule 3 - Blocking issue] `select`, `checkbox`, `skeleton` shadcn components needed beyond the plan's initial list**
- **Found during:** Task 2, writing `admin/app/packs/detail/page.tsx` and `admin/app/packs/page.tsx`
- **Issue:** The plan's "Add the shadcn components this task needs" sentence names only button,
  input, label, card, table, sonner — but the same task's own later instructions require a Select
  (data type), Checkbox (Required flag), and Skeleton (loading state).
- **Fix:** Added `select`, `checkbox`, `skeleton` via `npx shadcn add`. 01-UI-SPEC.md's own
  Component Inventory section explicitly allows this ("non-exhaustive... never a closed
  allowlist").
- **Files modified:** `admin/components/ui/{select,checkbox,skeleton}.tsx`

**5. [Rule 3 - Blocking issue] `ADMIN_API_TOKEN` missing from `api/.env`**
- **Found during:** Task 2, before the manual smoke verification
- **Issue:** `api/.env` had no `ADMIN_API_TOKEN`, which the plan's own `user_setup` section
  describes as a value to "generate locally: `openssl rand -hex 32`" — not a third-party
  credential requiring human dashboard access.
- **Fix:** Generated a token with `openssl rand -hex 32` and appended it to `api/.env` (not
  committed — `.gitignore`d as a real env file). `api/.env.example` was updated with all five new
  Phase 1 env var placeholders (`ADMIN_API_TOKEN`, `SMARTY_AUTH_ID`, `SMARTY_AUTH_TOKEN`,
  `ADMIN_ORIGIN`, `TEST_DATABASE_URL`) per the plan's ENV CONTRACT instruction.
- **Files modified:** `api/.env` (untracked, not committed by design), `api/.env.example`

None of these five reached Rule 4 (architectural change) — all were either blocking-issue fixes
necessary to make the plan's own later instructions work, or direct implementations of
contingencies the plan/UI-SPEC had already anticipated.

## Git Commits Not Run

**This plan's code, tests, and documentation changes are complete and verified, but no git commits
were made.** Every `git commit` invocation in this environment was denied by the Claude Code
permission classifier ("Blocked by classifier"), consistent with this project's standing
convention that the user runs all git commits themselves. `git add` (staging) was not blocked and
was used normally to stage all task-related files individually (never `git add .`/`-A`).

**Current state:** all files listed under `key-files` above are staged (`git status --short`
shows `A`/`M` for each). `.planning/STATE.md` was left untouched and unstaged, per this
execution's explicit instruction that the orchestrator owns STATE.md/ROADMAP.md writes.

**Prepared commit messages** (for the user or orchestrator to run, split along the plan's own
task boundaries):

<details>
<summary>Task 2 commit message (tracer: db client, auth, admin routes, admin app, test harness)</summary>

```
feat(01-01): admin walking skeleton — sign in, create pack, add field

Wires the full Walking Skeleton path end-to-end: admin/ Next.js static-export
app, an authenticated /v1/admin/* route surface on the API, and a Vitest
integration harness against the local wowm-db container.

- api/src/db/client.ts: single Drizzle client bound to DATABASE_URL
- api/src/middleware/adminAuth.ts: shared bearer token preHandler (D-01),
  timingSafeEqual comparison, 401/403/500 per the auth contract
- api/src/routes/admin/{index,packs,fields}.ts: POST/GET /v1/admin/packs,
  GET /v1/admin/packs/:id, POST /v1/admin/packs/:id/framework/fields
  (ADMINFW-01), Zod validation, Drizzle query builder only
- api/src/server.ts: buildApp() factory, @fastify/cors with explicit
  ADMIN_ORIGIN, logger redact on req.headers.authorization
- api/test/setup.ts + vitest.config.ts: testDb/resetDb/buildTestApp against
  a real wowm_test database, migrated via drizzle-orm's migrator
- api/src/routes/admin/packs.test.ts: end-to-end tracer test (create + list)
- admin/: scaffolded via create-next-app + shadcn init (radix base, neutral
  color, small radius, geist font — see 01-UI-SPEC.md for the preset-code
  mapping this CLI generation required instead of the old new-york/default
  style grammar), output: 'export', no dynamic path segments (pack detail
  reads ?id= via useSearchParams in a Suspense boundary)
- admin/lib/api.ts, app/page.tsx (sign-in), app/packs/page.tsx (list+create),
  app/packs/detail/page.tsx (framework field row)

Deviations (all auto-fixed, Rule 3 — see 01-01-SUMMARY.md for full detail):
- api/tsconfig.json: dropped rootDir: "src" (api/test/setup.ts lives outside
  it) and added test/**/*.ts to include; api/package.json "start" script
  path updated to match the resulting dist/src/server.js output location
- admin/.gitignore: added `!.env.local.example` — the generated blanket
  `.env*` ignore would have silently dropped the committed env contract file
- Generated a local ADMIN_API_TOKEN into api/.env (openssl rand -hex 32,
  per the plan's own user_setup instructions — not a third-party credential)
- shadcn CLI v4 replaced the style=new-york/baseColor grammar entirely with
  named presets; built an equivalent custom preset code (see 01-UI-SPEC.md)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```
</details>

<details>
<summary>Task 3 commit message (auth boundary negative tests + ADMINFW-01 write-path tests)</summary>

```
test(01-01): lock the auth boundary and ADMINFW-01 write path

- api/src/routes/admin/packs.test.ts: adds the full negative-auth suite —
  missing header (401), wrong scheme (401), wrong token (403), truncated
  token (403), unset ADMIN_API_TOKEN (500), and confirms /healthz stays
  open with no Authorization header, proving the preHandler is scoped to
  the admin plugin and hasn't leaked onto the whole app
- api/src/routes/admin/fields.test.ts (new): asserts the ADMINFW-01 write
  reads back correctly via testDb (not just the HTTP response), plus
  400 VALIDATION_FAILED for a fieldKey regex violation and 409
  FIELD_KEY_TAKEN for a duplicate key on the same pack
- Both suites call resetDb() in beforeEach so cases don't depend on order

npm --prefix api test: 2 files, 11 tests, all passing.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```
</details>

If the user prefers one combined commit instead of two, all files are already staged together and
either message (or a merged one) will apply cleanly.

## Known Stubs

None — every screen built in this plan (sign-in, pack list/create, pack detail/field-add) is wired
to a real API endpoint and a real Postgres round trip; nothing renders hardcoded/mock data.

## Threat Flags

None beyond what `01-01-PLAN.md`'s own `<threat_model>` already anticipated (T-01-01 through
T-01-11, T-01-SC) — no new endpoints, auth paths, or trust boundaries were introduced beyond what
that table already covers.

## Self-Check: PASSED

All 18 files listed in `key-files` (created + representative modified paths) verified present on
disk via `[ -f "$f" ]`. No commit hashes to verify — see "Git Commits Not Run" above; `git status
--short` confirms every file is staged (`A`/`M`) and ready for the user's own commit.
