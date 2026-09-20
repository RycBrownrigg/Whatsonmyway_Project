# Phase 1: Admin Pack Authoring & Build - Context

**Gathered:** 2026-09-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin can go from an empty catalog to a build-ready standard pack using only manually-entered data: define a pack's fields/filters, add POIs manually with automatic geocoding, and trigger a pack build that validates and packages them. No import pipeline (Phase 6), no end-user-facing surface (Phase 2+), no purchases (Phase 3). Requires standing up the admin web app (`admin/`, Next.js) for the first time and adding the first real route handlers to `api/` beyond `/healthz`.

</domain>

<decisions>
## Implementation Decisions

This ran under `--auto` (autonomous discuss-phase). No user questions were asked — decisions below are Claude's recommended defaults, auto-selected per the single-admin, low-volume context the spec establishes (§1: "packs are built, updated, and published by the product owner only"). All are implementation-level, not product/business decisions, and are called out here for visibility rather than left silent.

### Admin Authentication
- **D-01:** Single shared credential via a bearer token (`ADMIN_API_TOKEN` env var, added to `wowm/infra/.env`), checked by a Fastify `preHandler` on every `/v1/admin/*` route. Admin web app has a minimal login screen that submits the token once and stores it client-side (Next.js static export has no server session to lean on); subsequent requests send it as `Authorization: Bearer <token>`. — **Reversibility:** costly — replacing this with real per-admin accounts later means adding an `admin_users` table, a login/session flow, and swapping the preHandler check across every admin route; no destructive data migration required since it's purely additive.
- Directly answers the spec's own open item ("whether admin auth is a separate, simpler mechanism... given single-admin usage") — this is the simplest option the spec itself names, and matches current reality (Ryc is the only admin).

### Geocoding Review Flow
- **D-02:** No dedicated "review queue" screen in Phase 1. Failed/low-confidence POIs get a status badge in the admin POI list; clicking one opens its edit form pre-filled, admin corrects the address, and re-triggers `POST /v1/admin/pois/:id/geocode`. — **Reversibility:** reversible — a dedicated queue screen can be layered on top later without changing the data model (`geocode_status`/`geocode_candidates` already support it).

### Pack Framework Builder UX
- **D-03:** Single-page form per pack with repeatable "Add Field" / "Add Filter" rows (key, label, data type, required flag / filter type, options) — not a multi-step wizard. Matches the low field-count, low-volume, single-admin usage the spec describes. — **Reversibility:** reversible.

### Pack Build Failure Reporting
- **D-04:** A failed build (missing required field on an included POI) surfaces as an inline table on the pack detail page: POI name + missing field(s). No CSV/downloadable export in Phase 1 — TC-27 only requires the build to "report which POIs/fields are missing," not a specific export format. — **Reversibility:** reversible.

### Claude's Discretion
- `admin/` does not exist yet — scaffold it via `create-next-app` (per `CLAUDE.md`: "scaffolded via their own CLI... rather than hand-written"), then add shadcn/ui + Tailwind CSS per spec §2.
- New admin route handlers live under a new `api/src/routes/admin/` directory; use Zod (already a dependency, unused so far) for request validation, matching the codebase's established schema-first pattern.
- No changes needed to `api/src/db/schema.ts` — `packs`, `packFieldDefinitions`, `packFilterDefinitions`, `pois`, `pack_pois`, `packVersions` already fully cover Phase 1's data needs.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product spec
- `Product Specification.md` §4 (SQL schema — `packs`, `pack_field_definitions`, `pack_filter_definitions`, `pois`, `pack_pois`, `pack_versions`)
- `Product Specification.md` §6 (Drizzle ORM schema — same tables, already implemented in `api/src/db/schema.ts`)
- `Product Specification.md` §7 (API Endpoints — Admin section: framework fields/filters, POI CRUD + geocode, pack build)
- `Product Specification.md` §8 (UC-11 Author a pack framework, UC-12 Add a POI manually, UC-14 Build/rebuild a standard pack)
- `Product Specification.md` §9 (TC-27, TC-28 — build validation test cases)
- `Product Specification.md` §15 (Error Taxonomy — geocoding codes: `ADDRESS_NOT_FOUND`, `ADDRESS_AMBIGUOUS`, `LOW_CONFIDENCE_MATCH`, `PROVIDER_ERROR`)
- `Product Specification.md` §17 (Geocoding Strategy — Smarty adapter, caching, confidence thresholds)
- `Product Specification.md` "Open items for future discussion" — admin auth question this phase resolves (D-01)

### Project planning docs
- `.planning/REQUIREMENTS.md` — ADMINFW-01, ADMINFW-02, ADMINPOI-01, ADMINPOI-02, ADMINBUILD-01
- `.planning/ROADMAP.md` — Phase 1 section (goal, success criteria, dependencies)
- `.planning/PROJECT.md` — constraints (tech stack, offline-first note doesn't apply here — admin is not offline-first)

### Codebase maps
- `.planning/codebase/ARCHITECTURE.md` — current scaffold state, admin auth flagged as TBD, layers/data flow
- `.planning/codebase/STACK.md` — exact dependency versions (Fastify 5.1.0, Drizzle 0.36.4, Zod 3.23.8)
- `.planning/codebase/INTEGRATIONS.md` — Smarty integration point, env var conventions

### Repo conventions
- `CLAUDE.md` — admin/app scaffolding convention (own CLI, not hand-written); schema-sync convention (spec §4/§6 must stay in sync with `api/src/db/schema.ts`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `api/src/db/schema.ts` — full Drizzle schema already covers every Phase 1 table; no migration needed beyond what's already generated.
- `api/src/server.ts` — Fastify app scaffold with `logger: true`; needs route registration, no rework.

### Established Patterns
- Drizzle schema: snake_case SQL columns, camelCase JS exports — follow this for any new query/insert code.
- Zod is a declared dependency but unused so far — Phase 1 is the first place to actually adopt it for request validation.
- `.env` / `dotenv` pattern already established for config (`DATABASE_URL`, `PORT`, `HOST`) — add `ADMIN_API_TOKEN` and `SMARTY_API_KEY` the same way.

### Integration Points
- New admin routes: `api/src/routes/admin/` (new directory).
- New admin web app: `admin/` (new, via `create-next-app`), calling the above routes with `Authorization: Bearer <ADMIN_API_TOKEN>`.
- Smarty geocoding: needs a thin adapter module (per spec §17 — "integrate behind a thin adapter so the provider can be swapped later"), likely `api/src/services/geocoding.ts` (new).

</code_context>

<specifics>
## Specific Ideas

No specific UI mockups or particular references given — this ran in `--auto` mode with no user input. Standard approaches per spec + shadcn/ui are open to the planner/executor's judgment within the decisions above.

</specifics>

<deferred>
## Deferred Ideas

- **Multi-admin / role-based admin accounts** — deferred until usage justifies it beyond the single-admin shared-token approach (D-01). Ties to the spec's own open item.
- **Bulk CSV import** — explicitly out of scope for Phase 1 (Phase 6: Import Pipeline). Phase 1 covers manual POI entry only.
- **Dedicated geocoding review-queue screen** — deferred in favor of the simpler inline-badge approach (D-02); revisit if flagged-POI volume grows.

</deferred>

---

*Phase: 1-Admin Pack Authoring & Build*
*Context gathered: 2026-09-20*
