<!-- refreshed: 2026-09-20 -->
# Architecture

**Analysis Date:** 2026-09-20

## System Overview

What's On My Way is a **three-tier offline-first iOS app** where end-users plan routes and search for POIs locally against downloaded packs. The backend exists only for catalog discovery, entitlements, pack distribution, and admin operations—never for live search.

```text
┌──────────────────────────────────────────────────────────────────────┐
│                         iOS/iPadOS Client                             │
│                   (Expo/React Native — offline-first)                 │
│                    `app/` — not yet scaffolded                        │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────────┐               │
│  │   Route    │  │ Local Pack  │  │  MapKit Route    │               │
│  │   Search   │  │   SQLite    │  │  + Sampling +    │               │
│  │   Engine   │  │   Storage   │  │  Haversine       │               │
│  └────────────┘  └─────────────┘  └──────────────────┘               │
└────────────────────────┬─────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    ┌──────────┐  ┌────────────┐  ┌─────────────┐
    │StoreKit  │  │  Download  │  │Auth (Sign   │
    │Purchase  │  │  API       │  │ in w/Apple) │
    │          │  │            │  │             │
    └──────────┘  └────────────┘  └─────────────┘
         │               │               │
         └───────────────┼───────────────┘
                         │
         ┌───────────────▼───────────────┐
         │                               │
    ┌────▼──────────────────────────────▼──┐
    │      Fastify API Backend              │
    │    `api/src/` — scaffold only         │
    │    Endpoints for:                     │
    │    - Auth (Sign in with Apple)        │
    │    - Catalog (packs listing)          │
    │    - Entitlements (ownership check)   │
    │    - Pack delivery (file download)    │
    │    - Admin ops (framework, build)     │
    └────┬──────────────────────────────┬──┘
         │                              │
         ▼                              ▼
    ┌─────────────┐         ┌──────────────────┐
    │PostgreSQL   │         │ App Store Server │
    │  16         │         │ API (receipt     │
    │ (master DB) │         │  verification)   │
    └─────────────┘         └──────────────────┘
         │
         ▼
    ┌──────────────────────────────┐
    │  Next.js Admin Web           │
    │  Pack authoring, master DB   │
    │  `admin/` — not scaffolded   │
    └──────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File / Location |
|-----------|----------------|-----------------|
| iOS Client | Plan routes, local search, purchase mgmt, offline usage | `app/` (Expo/React Native) — not yet scaffolded |
| Fastify API | Auth, catalog, entitlements, pack file delivery, admin | `api/src/server.ts` (scaffold); endpoints to be added |
| PostgreSQL 16 | Master database for all POIs, packs, users, entitlements | `api/src/db/schema.ts` (Drizzle ORM schema defined) |
| Admin Web | Pack framework authoring, POI imports, pack builds | `admin/` (Next.js static export) — not yet scaffolded |
| SQLite (on-device) | Downloaded pack data storage, local spatial indexing | Defined in Product Specification §5; lives on iOS device |

## Pattern Overview

**Overall:** Offline-first microservice architecture with server-driven entitlements.

**Key Characteristics:**
- **Offline-first search**: All route queries run locally against device-downloaded SQLite packs; backend is never in the hot path for end-user searches.
- **Server-driven entitlements**: StoreKit handles purchase UI/flow client-side; backend verifies via App Store Server API and gates access to pack files.
- **Two independent version numbers**: On-device schema (SQLite `PRAGMA user_version` migrations) and pack file format version (app refuses unknown formats and prompts for app update).
- **Denormalization strategy**: Backend data is normalized in PostgreSQL; on-device SQLite is denormalized for fast local reads.

## Layers

**API Layer (Fastify):**
- Purpose: HTTP entry point, auth/entitlement verification, pack file serving, admin operations.
- Location: `api/src/server.ts` (current scaffold); will expand with route handlers for catalog, auth, purchases, admin.
- Contains: Route handlers (to be added), middleware, error handling.
- Depends on: PostgreSQL via Drizzle ORM, environment variables for API keys (Apple App Store, Smarty geocoding).
- Used by: iOS client (for auth, catalog, entitlements, downloads), admin web (pack operations).

**Database Layer (Drizzle ORM):**
- Purpose: Manage all backend data: users, packs, POIs, entitlements, imports, feedback.
- Location: `api/src/db/schema.ts` (fully defined in Drizzle).
- Contains: Twelve tables (users, poiTypes, packs, packFieldDefinitions, packFilterDefinitions, pois, packPois, packVersions, entitlements, imports, importRowErrors, feedbackSubmissions).
- Indexes: `pois(poi_type_id)`, `pois(address_state)`, `pois(latitude, longitude)` for bounding-box pre-filtering (R-tree deferred pending Phase 1 benchmark).
- Depends on: PostgreSQL 16 (via `postgres` driver).
- Used by: Fastify API handlers (all CRUD operations).

**Local Storage (iOS SQLite — specified, not yet coded):**
- Purpose: Cache downloaded pack data; provides spatial index for local haversine queries.
- Location: On-device; schema in Product Specification §5.
- Contains: installed_packs, pack_field_defs, pack_filter_defs, pois (denormalized for reads).
- Indexes: `pois(pack_id)`, `pois(latitude, longitude)` for bounding-box pre-filter.
- Depends on: `expo-sqlite` (React Native driver).
- Used by: iOS route search engine to find POIs within route radius.

**Route Sampling & Spatial Search (iOS — specified, not yet coded):**
- Purpose: Convert route geometry into discrete samples, then haversine-filter candidate POIs.
- Location: Shared module in `app/` (to be created during Phase 0).
- Algorithm: See Product Specification §10 (always include start/end, target interval = min(radius, 10) miles, soft cap 500 samples, hard ceiling 2000, max gap = 2× radius).
- Benchmarking goal: Phase 1 exit criteria is synthetic 10k-POI pack + 2-3 packs simultaneously on lower-end device (time + memory).

## Data Flow

### Primary Request Path (End User: Route Search)

1. User opens route search screen (`app/`) and enters start/end locations.
2. App calls MapKit `MKDirections` to fetch route geometry.
3. App samples route points (Product Specification §10: start, end, interval-based samples).
4. App queries local SQLite `pois` table:
   - Bounding-box pre-filter (padded by search radius) on lat/lng index.
   - Haversine distance from each candidate to nearest route sample.
   - Filters by active packs and selected filter values.
5. App displays result list with POIs grouped/attributed by pack.
6. **Result**: No backend call, no network required.

### Purchase & Entitlement Path

1. User browses Pack Store (`app/`), selects a pack.
2. App initiates StoreKit purchase; user completes Apple payment sheet.
3. App receives `StoreKit.Transaction`, calls `POST /v1/purchases/verify` with signed transaction.
4. Backend verifies transaction via App Store Server API, records `entitlements` row.
5. App begins downloading pack file via `GET /v1/packs/:slug/download` (entitlement-gated).
6. App stores pack in local SQLite, auto-activates it.
7. **Result**: Pack ready for offline search; no further backend interaction unless refund/revoke webhook arrives.

### Refund/Revoke Path

1. User requests refund via Apple App Store.
2. Apple sends `App Store Server Notifications V2` webhook to `POST /v1/webhooks/app-store-notifications`.
3. Backend verifies webhook signature, sets `entitlements.revoked_at`.
4. On next entitlement check (app launch, restore, or download attempt), backend returns revoked status.
5. App blocks new downloads/updates; already-downloaded local data remains searchable (no forced deletion).

### Admin Path (Build a Pack)

1. Admin defines pack framework in web UI (`admin/`): POI type, fields, filters.
2. Admin imports CSV of POIs via `POST /v1/admin/imports`, specifying target POI type.
3. Backend validates file structure, geocodes addresses via Smarty, flags anomalies (missing fields, duplicates, low confidence).
4. Admin reviews flagged rows, corrects any issues manually.
5. Admin triggers `POST /v1/admin/packs/:id/build`.
6. Backend selects all active, successfully-geocoded POIs of the pack's POI type, validates all required fields present, generates pack file, computes checksum, creates `pack_versions` entry.
7. Admin publishes pack (sets status to 'published').
8. **Result**: Pack available for purchase in catalog; clients begin downloading.

### State Package Build Path

1. Same as standard pack, except backend selects all active, geocoded POIs where `address_state = state_code`, across all POI types.
2. State pack retains each POI's pack-of-origin filters/fields.

**State Management:**
- **Client-side**: TanStack Query (caching downloaded pack metadata + entitlements).
- **Server-side**: PostgreSQL rows are single source of truth; no in-memory caches initially (can add redis later if needed).
- **Token refresh**: Access tokens ~1hr; refresh tokens in secure storage. Silent refresh on app launch but never blocks offline path. Forced re-login only on network-required action with dead refresh token.

## Key Abstractions

**Pack:**
- Purpose: Represents a purchasable, downloadable dataset (all Waffle Houses, or all POIs in Colorado).
- Examples: Standard pack (single POI type) vs. State pack (all POI types in a state).
- Pattern: Drizzle table `packs` with `packType` enum ('standard' | 'state'); state packs set `stateCode`, standard packs set `poiTypeId`.

**Pack Framework (Fields + Filters):**
- Purpose: Define pack-specific data schema and user-facing filter options.
- Examples: A "Coffee Shops" pack might have a "has_wifi" boolean filter and a "roaster_name" text field.
- Pattern: Two junction tables (`packFieldDefinitions`, `packFilterDefinitions`) scoped to a pack; POI data stored in JSONB (`customFields`, `filterValues`).

**POI (Point of Interest):**
- Purpose: A single location (address, coordinates, optional phone/website/notes).
- Pattern: Master table `pois` stores all data; `pack_pois` is a many-to-many snapshot (rebuilt on pack build/update).

**Pack Version:**
- Purpose: Versioned, downloadable release of a pack (with checksum for integrity, format_version for client compatibility).
- Pattern: `packVersions` table; app checks manifest (`GET /v1/packs/:slug/manifest`) to detect updates, downloads new version if available.

**Entitlement:**
- Purpose: Records that a user owns a pack (linked to Apple account via Sign in with Apple).
- Pattern: `entitlements` table; unique constraint on `(userId, packId)`; revoke handled via webhook setting `revoked_at`.

## Entry Points

**API (Fastify):**
- Location: `api/src/server.ts`
- Triggers: HTTP requests from iOS client or admin web app.
- Responsibilities: Route dispatch to handlers (auth, catalog, entitlements, admin).
- Current state: Healthz endpoint only; full endpoint list in Product Specification §7.

**iOS App:**
- Location: `app/` (Expo Router, to be scaffolded)
- Triggers: User opens app; backgrounding/foregrounding; manual refresh actions.
- Responsibilities: UI, route planning, local search, purchase flow, pack management.

**Admin Web:**
- Location: `admin/` (Next.js static export, to be scaffolded)
- Triggers: Admin user opens web interface.
- Responsibilities: Pack framework authoring, POI import, pack building, feedback triage.

## Architectural Constraints

- **Threading:** Node.js single-threaded event loop (Fastify); offload CPU-intensive tasks (large imports, pack file generation) to background jobs if needed (deferred to later phase).
- **Global state:** No module-level singletons currently; Drizzle schema is stateless query builder.
- **Circular imports:** None detected in current scaffold; enforce via linting in CI.
- **Offline-first contract:** iOS app must never depend on backend for core search. All search queries run locally. Implications:
  - Pack file format is immutable once released (format_version gates acceptance).
  - On-device schema migrations must be infallible (failed migration blocks app, not retry-able).
  - Refresh tokens must allow silent auth bypass for route search (already-downloaded packs are always searchable, even offline).

## Anti-Patterns

### Hard Dependency on Backend for Local Operations

**What happens:** If future code makes the local search path require a backend call (e.g., to verify entitlement for every search), the app breaks offline.
**Why it's wrong:** The core selling point is "search works everywhere, no connection needed." Breaking it defeats the product.
**Do this instead:** Entitlements are checked only at download/update time. Once a pack is local, it's searchable regardless of network or backend availability. See Product Specification §1 (Offline-first).

### Denormalization Without Discipline

**What happens:** If custom fields or filter values are modified in the backend without bumping the pack file format version and re-building, clients won't see the changes (they're using stale local copies).
**Why it's wrong:** Data inconsistency and confusing admin experience (looks published but clients see old state).
**Do this instead:** Any schema change to `customFields` or `filterValues` keys triggers a `packVersions` entry with a new `formatVersion`. Admin cannot modify framework without rebuilding. Product Specification §13 (Versioning).

### Loose Entitlement Verification

**What happens:** Backend serves a pack file to a client that hasn't verified the entitlement via App Store Server API, or the entitlement has been revoked but backend returns the file anyway.
**Why it's wrong:** Revenue leakage (free access to paid packs); refund/revoke handling broken.
**Do this instead:** Every `GET /v1/packs/:slug/download` checks `entitlements` table for `(userId, packId)` where `revoked_at IS NULL` before serving. No exceptions. Webhook must atomically set `revoked_at` on refunds.

## Error Handling

**Strategy:** Layered — validation at API boundary (Zod schemas), business logic errors (e.g., "pack not found") returned as HTTP errors with machine codes, database errors logged and surfaced as 500.

**Patterns:**
- Geocoding errors (admin-facing): `ADDRESS_NOT_FOUND`, `ADDRESS_AMBIGUOUS`, `LOW_CONFIDENCE_MATCH`, `PROVIDER_ERROR` — flagged in import row and stored for admin review.
- Download errors (client-facing): `NETWORK_UNAVAILABLE`, `CHECKSUM_MISMATCH`, `ENTITLEMENT_NOT_FOUND`, `ENTITLEMENT_REVOKED`, `STORAGE_FULL`, `SERVER_UNAVAILABLE` — see Product Specification §15.
- Import errors: File-level (`MISSING_REQUIRED_COLUMN`, hard stop) vs. row-level (`INVALID_FORMAT`, `DUPLICATE_SUSPECTED`, continue). See Product Specification §15 and UC-13.

## Cross-Cutting Concerns

**Logging:** Fastify built-in logger (pino); structured JSON to stdout. Errors logged with context (userId, packId, import batch ID, etc.).

**Validation:** Zod schemas on all API inputs (auth body, purchase verification, import file). Required fields enforced at schema level; optional fields skip validation if absent.

**Authentication:** Sign in with Apple → backend session (JWT access + rotating refresh tokens in secure storage on iOS). No persistent session on server side initially (stateless JWT); can add redis for revocation lists if needed later.

**Authorization:** 
- Public endpoints (catalog, app version): no auth required.
- User endpoints (purchases, entitlements, downloads): require valid access token.
- Admin endpoints: separate admin auth mechanism (TBD in product discussions; currently simple for single-admin use).
- Webhook endpoints: verify Apple's signature (cryptographic validation, not just a secret).

---

*Architecture analysis: 2026-09-20*
