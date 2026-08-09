# What's On My Way

iPhone/iPad app: plan a route, search for points of interest within a chosen
radius of it. POI data comes from purchasable "Packs" (StoreKit non-consumables),
each with pack-specific filters. State Packs are derived, cross-type packs
scoped to one state.

**Source of truth**: `Product Specification.md` — product decisions, SQL schema,
Drizzle schema, API endpoints, use cases (Actor/Precondition/Flow), test cases
(Given/When/Then), error taxonomy, and phased roadmap all live there. Read it
before making architectural changes; keep it in sync with anything that
changes the data model, API surface, or a confirmed product decision.

## Layout

- `api/` — backend: Fastify + TypeScript + Drizzle ORM + PostgreSQL 16
- `admin/` — pack authoring / master DB / import admin tool: Next.js (static export)
- `app/` — iOS/iPadOS client: Expo (React Native) + TypeScript
- `infra/` — local Docker Compose for `wowm-db` (+ `wowm-api` when containerized)

`app/` and `admin/` are scaffolded via their own CLI (`create-expo-app`,
`create-next-app`) rather than hand-written — see each directory's own setup
notes once created.

## Conventions

- Offline-first: all end-user search runs on-device against downloaded pack
  data (SQLite). The backend exists for catalog, entitlements, pack
  distribution, and admin — never for live search.
- Every pack purchase/entitlement flows through Apple StoreKit + the App
  Store Server API — no parallel payment path.
- No device location permission for v1 — start/end are always typed/selected.
- Schema changes to the backend `pois`/`packs`/entitlement tables should be
  reflected in both §4 (SQL) and §6 (Drizzle) of the spec, plus the on-device
  schema (§5) if the pack file format is affected (bump `format_version`).

## Deployment target

VPS (`rycsprojects`, see local `rycsprojects_config.md` for full details):
Ubuntu 24.04, Docker + nginx + certbot + ufw + fail2ban. Follows the same
pattern as the existing `ebay-api` / `ddd-api` containers — dedicated Postgres
container, API bound to `127.0.0.1:<port>`, nginx reverse-proxies with TLS.
See Product Specification.md §3 for the concrete `wowm-api` / `wowm-db` plan.
