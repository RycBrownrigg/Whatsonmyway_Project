# Walking Skeleton — What's On My Way

**Phase:** 1
**Generated:** 2026-09-20

## Capability Proven End-to-End

An admin signs in to the `admin/` web app with the shared bearer token, creates a pack, adds a
framework field to it, and sees both persisted in the Dockerised PostgreSQL master database and
rendered back in the browser.

This is the thinnest path that touches every layer Phase 1 (and Phases 2–6) will keep using:
browser form → TanStack Query → `admin/lib/api.ts` fetch wrapper → `Authorization: Bearer` →
Fastify `preHandler` auth → Drizzle → Postgres → back out as JSON → React render.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Admin framework | Next.js 15 App Router, **static export** (`output: 'export'`) | `Product Specification.md` §2 "Web Interface" mandates Next.js static export; the VPS serves it as plain static files behind nginx, same pattern as the other `rycsprojects` sites |
| Admin routing | **No dynamic path segments.** Entity IDs travel as query params read by `useSearchParams()` inside a `<Suspense>` boundary. Pack detail is `/packs/detail?id=<uuid>`, not `/packs/[id]` | `output: 'export'` can only emit dynamic routes enumerated at build time via `generateStaticParams`; pack/POI UUIDs are created at runtime, so a `[id]` segment cannot be statically exported. This supersedes the `admin/app/packs/[id]/page.tsx` path shown in `01-PATTERNS.md`, which did not account for the static-export constraint |
| Admin UI kit | shadcn (`new-york` style, `neutral` base, CSS variables on, RSC on) + Tailwind CSS + lucide-react | `01-UI-SPEC.md` Design System table; `new-york` chosen for the denser data/table-heavy admin screens |
| Admin remote state | TanStack Query v5 | Spec §2 "Web Interface → State" |
| Admin form/validation | React Hook Form + Zod via `@hookform/resolvers` | Spec §2 + `01-PATTERNS.md` Form & Validation Pattern; the Zod object is the single shared shape with the API handler |
| API framework | Fastify 5 (existing `api/src/server.ts` scaffold) + `@fastify/cors` | Already in the repo; CORS is newly required because the statically-exported admin app runs on a different origin (`:3000`) from the API (`:3003`) |
| Data layer | PostgreSQL 16 + Drizzle ORM, schema **unchanged** | `api/src/db/schema.ts` already covers every Phase 1 table (`packs`, `pack_field_definitions`, `pack_filter_definitions`, `pois`, `pack_pois`, `pack_versions`). Per `01-CONTEXT.md` Claude's Discretion, Phase 1 needs no schema change, so `Product Specification.md` §4/§6 stay in sync by construction |
| DB connection module | New `api/src/db/client.ts` exporting `db` (Drizzle) and `sql` (postgres-js) | No connection module exists yet — `schema.ts` is table definitions only |
| Admin auth | Single shared bearer token in `ADMIN_API_TOKEN`, checked by a Fastify `preHandler` on every `/v1/admin/*` route; token held in browser `localStorage` (**D-01**) | Resolves the spec's own open item ("whether admin auth is a separate, simpler mechanism given single-admin usage"). Rated **costly**: swapping in per-admin accounts later means an `admin_users` table + session flow + one preHandler change — additive, no destructive migration |
| Admin route layout | `api/src/routes/admin/index.ts` is a single Fastify plugin that installs the auth `preHandler` once and registers every admin route module | One place owns the auth boundary; a later route module cannot accidentally register itself outside the authenticated scope |
| Test runner | Vitest, co-located `*.test.ts`, integration tests against a real `wowm_test` database in the local `wowm-db` container | `.planning/codebase/TESTING.md` recommends exactly this; "What NOT to Mock: Drizzle ORM queries (use test database)" |
| Deployment (dev) | `docker compose -f infra/docker-compose.yml up -d wowm-db` + `npm --prefix api run dev` + `npm --prefix admin run dev` | Documented local full-stack run; the containerised `wowm-api` + nginx VPS deployment stays as spec §3 describes and is not exercised in Phase 1 |
| Directory layout | `api/src/{db,middleware,routes/admin,services,utils}` + `admin/{app,components,lib}` | Extends the existing `api/src/db` convention; matches `01-PATTERNS.md` |

## Stack Touched in Phase 1

- [ ] Project scaffold — `create-next-app` + `npx shadcn init` produce `admin/`; `vitest` + `api/vitest.config.ts` + `api/test/setup.ts` produce the API test harness
- [ ] Routing — `admin/app/page.tsx` (sign-in), `admin/app/packs/page.tsx` (list + create), `admin/app/packs/detail/page.tsx`; API `POST`/`GET /v1/admin/packs`
- [ ] Database — real write (`INSERT INTO packs`, `INSERT INTO pack_field_definitions`) and real read (`SELECT` both back into the pack list / detail view) through Drizzle
- [ ] UI — the pack create form and the `+ Add Field` framework row are live, submit through `admin/lib/api.ts`, and re-render from the server response
- [ ] Deployment — documented local full-stack run command against the Dockerised `wowm-db`

## Out of Scope (Deferred to Later Slices)

- Multi-admin / role-based admin accounts — deferred per `01-CONTEXT.md` Deferred Ideas (D-01 stays a single shared token)
- Any end-user-facing API (`/v1/auth/apple`, `/v1/packs`, `/v1/purchases/*`, `/v1/entitlements`, `/v1/feedback`) — Phases 2–6
- Pack **download/serving** endpoint and entitlement gating — Phase 2 downloads the Phase 1 pack file directly; Phase 3 gates it
- Bulk CSV import, import status/row errors, `imports` / `import_row_errors` tables — Phase 6
- Dedicated geocoding review-queue screen — deferred per D-02 in favour of inline status badges
- State pack build (`ADMINBUILD-02`, UC-15, TC-29) — Phase 4
- Pack publish/unpublish workflow — Phase 1 builds versions; a build never auto-publishes
- Dark mode — `01-UI-SPEC.md` declares light mode only
- The `users`, `entitlements`, `feedback_submissions` tables — present in the schema, untouched this phase
- A persistent geocode cache table — Phase 1 short-circuits re-geocoding on the `pois` row itself; a real cache table lands with Phase 6's bulk import

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its
architectural decisions:

- Phase 2: A user plans a route and sees POIs from an on-device copy of a Phase 1 pack, plus full POI detail.
- Phase 3: A user buys a pack through Apple StoreKit and the server verifies the transaction into an entitlement.
- Phase 4: A user manages several active packs at once, filters results, and buys a cross-type State Pack.
- Phase 5: App and packs detect, resumably download, checksum-validate, and migrate updates without corrupting local state.
- Phase 6: Admin imports datasets at scale; users file data corrections and admin triages them.
