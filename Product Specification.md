# What's On My Way — Product Specification

Status: Draft v1 — synthesized from Draft Specification.md, Tech Stack.md, and design discussion.

---

## 1. Product Overview

An iPhone/iPad app where a user plans a route (point A → point B), picks a search radius off that route (1, 5, 10, 25, or 50 miles), and sees points of interest (POIs) within that corridor. POI data comes from purchasable **Packs** — focused databases (e.g., all Waffle Houses, or unusual roadside attractions) — each with its own pack-specific filters (e.g., 24-hour, delivery, dog-friendly). **State Packs** are a derived pack type containing every POI (across all types) within a given state.

### Confirmed product decisions

- **Purchases**: Apple In-App Purchase (StoreKit). Each pack is a non-consumable IAP product; ownership is tied to the purchasing Apple account.
- **Data locality**: Offline-first. Purchased pack data downloads to the device; route search runs locally without a network call.
- **"Along the route" filtering for state packs**: No special geographic boundary logic needed. A state pack only contains POIs from that state, so the existing rule — show POIs from active packs within the selected radius of the route — naturally limits results to the portion of the route that passes through (or near) that state.
- **Pack authorship**: Initially, packs are built, updated, and published by the product owner only. Third parties may submit data for inclusion, but import/curation is manually managed, not self-serve.
- **Additional data**: Every POI has exactly one freeform `additional_info` text field (not searchable, not filterable), shown only in the POI detail view, and only when non-empty. No per-pack freeform fields.
- **Routing**: Apple MapKit (`MKDirections`) — free, no key management, native to the iOS/iPadOS-only target, adequate for US road-trip use cases.
- **Local spatial search**: Start with a plain linear distance calculation (haversine, POI vs. sampled route points) in on-device SQLite. Defer spatial indexing (SQLite R-tree) until real pack sizes show it's needed — see Phase 6.
- **Platform scope**: iPhone and iPad only, to start. No Android/web client for end users (web is admin/internal only).

---

## 2. Tech Stack

### Backend (VPS)

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + TypeScript |
| Framework | Fastify |
| ORM | Drizzle ORM |
| Database | PostgreSQL 16 (dedicated container) |
| Auth | Sign in with Apple → backend session (JWT access + rotating refresh tokens) |
| Payments | Apple StoreKit 2 (client) + App Store Server API (server-side receipt/transaction verification) |
| Container | Docker, bound to `127.0.0.1:<port>`, proxied by nginx (same pattern as existing VPS services) |

### iOS App

| Layer | Technology |
|-------|-----------|
| Framework | Expo (React Native) + TypeScript |
| Navigation | Expo Router |
| UI | NativeWind (Tailwind for React Native) + small set of custom components |
| Routing/Directions | Apple MapKit (`MKDirections`) |
| Local storage | SQLite (`expo-sqlite`) — installed pack data, offline search |
| Purchases | `react-native-iap` or Expo's StoreKit 2 bindings |
| Auth Storage | expo-secure-store |
| Remote State | TanStack Query |
| Validation | Zod |

### Web Interface (Admin: pack authoring, master DB, imports)

| Layer | Technology |
|-------|-----------|
| Framework | Next.js + TypeScript (static export) |
| UI | shadcn/ui + Tailwind CSS |
| State | TanStack Query |
| Validation | Zod |

---

## 3. VPS Infrastructure

Follows the existing pattern used by `ebay-api-1` / `ddd-api-ddd-admin-1` on `rycsprojects` (Ubuntu 24.04, Docker + nginx + certbot + UFW + fail2ban).

| Component | Detail |
|-----------|--------|
| API container | `wowm-api` (Fastify + Drizzle), image `wowm-api:latest`, bound to `127.0.0.1:3003` (next free port after 3001/3002) |
| DB container | `wowm-db` (`postgres:16-alpine`), internal only, dedicated volume `wowm_db-data` |
| Domain | `wowm.rycsprojects.com` (or final product domain) — nginx reverse proxy → `127.0.0.1:3003`, HTTPS via certbot, HSTS + security headers per existing global config |
| Admin web | Static export served under the same domain (e.g. `/admin`) or a subdomain `admin.wowm.rycsprojects.com`, same static-hosting pattern as other sites |
| Pack file storage | Stored on VPS disk (or object storage later), served **only** via authenticated API endpoint — not public `/var/www/` static files, since access must be entitlement-gated |
| Rate limiting | Add `wowm` API locations to existing `zone=api` (20r/s) nginx rate limit |
| Backups | Extend `vps-backup.sh`: `pg_dump` for `wowm-db` alongside existing `ebay.sql.gz` / `ddd.db.gz` jobs |
| Monitoring | Extend `server-monitor.sh` Docker check to include `wowm-api` / `wowm-db` containers |
| Secrets | Apple App Store Server API key (`.p8`), Sign in with Apple config, JWT signing secret — in `wowm/infra/.env`, same convention as `ebay/infra/.env` |

---

## 4. SQL Data Model (PostgreSQL — backend / master database)

```sql
-- Users (app accounts, tied to Sign in with Apple)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apple_sub TEXT NOT NULL UNIQUE,        -- 'sub' claim from Sign in with Apple
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- POI Types (categorizes POIs; a standard pack maps to one poi_type)
CREATE TABLE poi_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,             -- e.g. 'waffle-house'
  name TEXT NOT NULL,                    -- e.g. 'Waffle House'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Packs (purchasable products; standard or state)
CREATE TABLE packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  pack_type TEXT NOT NULL CHECK (pack_type IN ('standard', 'state')),
  poi_type_id UUID REFERENCES poi_types(id),   -- NULL for state packs (mixed types)
  state_code CHAR(2),                          -- set only for state packs
  apple_product_id TEXT NOT NULL UNIQUE,       -- StoreKit product identifier
  price_tier TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','deprecated')),
  current_version INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pack framework: pack-specific additional data fields
CREATE TABLE pack_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  data_type TEXT NOT NULL CHECK (data_type IN ('text','number','boolean','url','phone','enum')),
  enum_options JSONB,                    -- only when data_type = 'enum'
  is_required BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE (pack_id, field_key)
);

-- Pack framework: pack-specific filters
CREATE TABLE pack_filter_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  filter_key TEXT NOT NULL,
  label TEXT NOT NULL,
  filter_type TEXT NOT NULL CHECK (filter_type IN ('boolean','single-select','multi-select')),
  options JSONB,                         -- for select types
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE (pack_id, filter_key)
);

-- Master POI table (source of truth for all points of interest)
CREATE TABLE pois (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poi_type_id UUID NOT NULL REFERENCES poi_types(id),
  name TEXT NOT NULL,
  address_street TEXT NOT NULL,
  address_city TEXT NOT NULL,
  address_state CHAR(2) NOT NULL,
  address_zip TEXT NOT NULL,
  phone TEXT,
  website TEXT,
  additional_info TEXT,                        -- single freeform field, detail view only
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  geocode_status TEXT NOT NULL DEFAULT 'pending' CHECK (geocode_status IN ('pending','ok','failed')),
  custom_fields JSONB NOT NULL DEFAULT '{}',   -- keyed by pack_field_definitions.field_key
  filter_values JSONB NOT NULL DEFAULT '{}',   -- keyed by pack_filter_definitions.filter_key
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','flagged','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pois_poi_type_idx ON pois (poi_type_id);
CREATE INDEX pois_state_idx ON pois (address_state);

-- Pack <-> POI membership snapshot (rebuilt whenever a pack is generated/updated)
CREATE TABLE pack_pois (
  pack_id UUID NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  poi_id UUID NOT NULL REFERENCES pois(id) ON DELETE CASCADE,
  PRIMARY KEY (pack_id, poi_id)
);

-- Versioned, downloadable pack releases
CREATE TABLE pack_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  version INT NOT NULL,
  file_url TEXT NOT NULL,                -- resolved via authenticated download endpoint
  checksum TEXT NOT NULL,
  poi_count INT NOT NULL,
  changelog TEXT,
  released_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pack_id, version)
);

-- Entitlements: which Apple account owns which pack
CREATE TABLE entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id UUID NOT NULL REFERENCES packs(id),
  apple_original_transaction_id TEXT NOT NULL,
  apple_transaction_id TEXT NOT NULL,
  purchased_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  UNIQUE (user_id, pack_id)
);

-- Data import batches (admin tooling)
CREATE TABLE imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poi_type_id UUID NOT NULL REFERENCES poi_types(id),
  filename TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  total_rows INT NOT NULL DEFAULT 0,
  flagged_rows INT NOT NULL DEFAULT 0,
  error_message TEXT,                    -- set when import hard-stops (missing required field)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE import_row_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  row_number INT NOT NULL,
  field TEXT,
  message TEXT NOT NULL
);
```

---

## 5. On-Device Data Model (SQLite — iOS local pack storage)

Denormalized for fast local reads; repopulated on pack install/update from the downloaded pack file.

```sql
CREATE TABLE installed_packs (
  pack_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pack_type TEXT NOT NULL,
  version INTEGER NOT NULL,
  downloaded_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1   -- toggled by multi-pack selection UI
);

CREATE TABLE pack_field_defs (
  pack_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  data_type TEXT NOT NULL,
  enum_options TEXT,           -- JSON string
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (pack_id, field_key)
);

CREATE TABLE pack_filter_defs (
  pack_id TEXT NOT NULL,
  filter_key TEXT NOT NULL,
  label TEXT NOT NULL,
  filter_type TEXT NOT NULL,
  options TEXT,                 -- JSON string
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (pack_id, filter_key)
);

CREATE TABLE pois (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL,
  poi_type_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  address_street TEXT NOT NULL,
  address_city TEXT NOT NULL,
  address_state TEXT NOT NULL,
  address_zip TEXT NOT NULL,
  phone TEXT,
  website TEXT,
  additional_info TEXT,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  custom_fields TEXT NOT NULL DEFAULT '{}',   -- JSON string
  filter_values TEXT NOT NULL DEFAULT '{}'    -- JSON string
);
CREATE INDEX pois_pack_idx ON pois (pack_id);
-- Revisit: SQLite R-tree spatial index if Phase 6 profiling shows linear scan is too slow.
```

---

## 6. Drizzle ORM Schema (backend)

```ts
import {
  pgTable, uuid, text, char, boolean, integer,
  jsonb, timestamp, doublePrecision, unique, primaryKey,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  appleSub: text('apple_sub').notNull().unique(),
  email: text('email'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const poiTypes = pgTable('poi_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const packs = pgTable('packs', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  packType: text('pack_type', { enum: ['standard', 'state'] }).notNull(),
  poiTypeId: uuid('poi_type_id').references(() => poiTypes.id),
  stateCode: char('state_code', { length: 2 }),
  appleProductId: text('apple_product_id').notNull().unique(),
  priceTier: text('price_tier'),
  status: text('status', { enum: ['draft', 'published', 'deprecated'] }).notNull().default('draft'),
  currentVersion: integer('current_version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const packFieldDefinitions = pgTable('pack_field_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  packId: uuid('pack_id').notNull().references(() => packs.id, { onDelete: 'cascade' }),
  fieldKey: text('field_key').notNull(),
  label: text('label').notNull(),
  dataType: text('data_type', { enum: ['text', 'number', 'boolean', 'url', 'phone', 'enum'] }).notNull(),
  enumOptions: jsonb('enum_options'),
  isRequired: boolean('is_required').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => ({
  uniq: unique().on(t.packId, t.fieldKey),
}));

export const packFilterDefinitions = pgTable('pack_filter_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  packId: uuid('pack_id').notNull().references(() => packs.id, { onDelete: 'cascade' }),
  filterKey: text('filter_key').notNull(),
  label: text('label').notNull(),
  filterType: text('filter_type', { enum: ['boolean', 'single-select', 'multi-select'] }).notNull(),
  options: jsonb('options'),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => ({
  uniq: unique().on(t.packId, t.filterKey),
}));

export const pois = pgTable('pois', {
  id: uuid('id').primaryKey().defaultRandom(),
  poiTypeId: uuid('poi_type_id').notNull().references(() => poiTypes.id),
  name: text('name').notNull(),
  addressStreet: text('address_street').notNull(),
  addressCity: text('address_city').notNull(),
  addressState: char('address_state', { length: 2 }).notNull(),
  addressZip: text('address_zip').notNull(),
  phone: text('phone'),
  website: text('website'),
  additionalInfo: text('additional_info'),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  geocodeStatus: text('geocode_status', { enum: ['pending', 'ok', 'failed'] }).notNull().default('pending'),
  customFields: jsonb('custom_fields').notNull().default({}),
  filterValues: jsonb('filter_values').notNull().default({}),
  status: text('status', { enum: ['active', 'flagged', 'archived'] }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const packPois = pgTable('pack_pois', {
  packId: uuid('pack_id').notNull().references(() => packs.id, { onDelete: 'cascade' }),
  poiId: uuid('poi_id').notNull().references(() => pois.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.packId, t.poiId] }),
}));

export const packVersions = pgTable('pack_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  packId: uuid('pack_id').notNull().references(() => packs.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  fileUrl: text('file_url').notNull(),
  checksum: text('checksum').notNull(),
  poiCount: integer('poi_count').notNull(),
  changelog: text('changelog'),
  releasedAt: timestamp('released_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: unique().on(t.packId, t.version),
}));

export const entitlements = pgTable('entitlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  packId: uuid('pack_id').notNull().references(() => packs.id),
  appleOriginalTransactionId: text('apple_original_transaction_id').notNull(),
  appleTransactionId: text('apple_transaction_id').notNull(),
  purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => ({
  uniq: unique().on(t.userId, t.packId),
}));

export const imports = pgTable('imports', {
  id: uuid('id').primaryKey().defaultRandom(),
  poiTypeId: uuid('poi_type_id').notNull().references(() => poiTypes.id),
  filename: text('filename').notNull(),
  status: text('status', { enum: ['processing', 'completed', 'failed'] }).notNull().default('processing'),
  totalRows: integer('total_rows').notNull().default(0),
  flaggedRows: integer('flagged_rows').notNull().default(0),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const importRowErrors = pgTable('import_row_errors', {
  id: uuid('id').primaryKey().defaultRandom(),
  importId: uuid('import_id').notNull().references(() => imports.id, { onDelete: 'cascade' }),
  rowNumber: integer('row_number').notNull(),
  field: text('field'),
  message: text('message').notNull(),
});
```

---

## 7. API Endpoints

### Auth

| Method | Path | Auth | Description |
|--------|------|------|--------------|
| POST | `/v1/auth/apple` | none | Exchange Sign in with Apple identity token for backend session (JWT access + refresh) |
| POST | `/v1/auth/refresh` | refresh token | Rotate refresh token, issue new access token |

### Catalog

| Method | Path | Auth | Description |
|--------|------|------|--------------|
| GET | `/v1/packs` | none | List published packs (metadata + `apple_product_id` for client-side StoreKit lookup) |
| GET | `/v1/packs/:slug` | none | Pack detail, including field/filter framework |

### Entitlements & Purchases

| Method | Path | Auth | Description |
|--------|------|------|--------------|
| POST | `/v1/purchases/verify` | user | Client submits StoreKit transaction; server verifies via App Store Server API, creates/updates entitlement |
| GET | `/v1/entitlements` | user | List current user's owned packs |
| POST | `/v1/entitlements/restore` | user | Re-derive entitlements from Apple's transaction history (reinstall / new device) |

### Pack Delivery

| Method | Path | Auth | Description |
|--------|------|------|--------------|
| GET | `/v1/packs/:slug/manifest` | user | Latest version, checksum, POI count — used for update checks |
| GET | `/v1/packs/:slug/download` | user + entitlement check | Streams/pre-signs the current pack version file |

### App Updates

| Method | Path | Auth | Description |
|--------|------|------|--------------|
| GET | `/v1/app/version` | none | Latest/minimum supported app version |

### Admin (separate admin auth, not exposed to end-user app)

| Method | Path | Description |
|--------|------|--------------|
| POST | `/v1/admin/poi-types` | Create a POI type |
| POST | `/v1/admin/packs` | Create a pack (standard or state) |
| PUT | `/v1/admin/packs/:id` | Update pack metadata / status |
| POST | `/v1/admin/packs/:id/framework/fields` | Define a pack field |
| POST | `/v1/admin/packs/:id/framework/filters` | Define a pack filter |
| POST | `/v1/admin/packs/:id/build` | Rebuild `pack_pois` snapshot from master + cut a new `pack_version` |
| POST | `/v1/admin/pois` | Add a single POI to the master database |
| PUT | `/v1/admin/pois/:id` | Edit a master POI |
| POST | `/v1/admin/pois/:id/geocode` | Manually trigger/retry geocoding |
| POST | `/v1/admin/imports` | Upload a dataset file, start an import job |
| GET | `/v1/admin/imports/:id` | Import status + row-level errors |

---

## 8. Use Cases

### End user

- **UC-1 — Search a route**: User enters start/end points, selects a radius, sees matching POIs from active packs.
- **UC-2 — View POI detail**: User taps a POI to see full address, phone, website, filters, and (if present) the additional-info note.
- **UC-3 — Purchase a pack**: User buys a pack via StoreKit; on success, the pack downloads and becomes searchable.
- **UC-4 — Restore purchases**: On a new device or reinstall, user restores prior purchases and re-downloads owned packs.
- **UC-5 — Filter within a pack**: User applies pack-specific filters (e.g., "24-hour", "dine-in") to narrow results.
- **UC-6 — Manage active packs**: With multiple packs installed, user selects which are active; filters for inactive packs are visible but disabled.
- **UC-7 — Buy and use a State Pack**: User buys a state pack; searching a cross-state route shows POIs only for the portion of the route within that state.
- **UC-8 — Receive updates**: App checks for and applies app/pack updates on launch or on demand.

### Admin (product owner)

- **UC-9 — Author a pack framework**: Define a pack's required fields, data types, and filters before populating data.
- **UC-10 — Add a POI manually**: Add a single POI to the master database, geocoded on save.
- **UC-11 — Import a dataset**: Upload a file of POIs; invalid/missing optional data is flagged for manual correction; a missing pack-required field halts the import with a reported error.
- **UC-12 — Build/rebuild a standard pack**: Generate or refresh a pack's POI snapshot from the master database by POI type.
- **UC-13 — Build/rebuild a state pack**: Generate or refresh a state pack from all master POIs (of any type) within that state.

---

## 9. Test Cases

### Route search & filtering (UC-1, UC-5, UC-6, UC-7)

- Route with POIs from two active packs within radius → combined result list, correctly attributed per pack.
- Changing radius (1 → 50 miles) updates results without requiring a new route calculation.
- No POIs within radius → empty state shown, not an error.
- Cross-state route (e.g. Denver → Dallas) with only a Colorado pack active → POIs shown only for the Colorado segment of the route.
- Deactivating a pack removes its POIs from results but keeps its filters visible (grayed out), not hidden.
- Selecting a pack-specific filter (e.g. "dog-friendly") narrows results to matching POIs only within currently active packs.

### Purchases & entitlements (UC-3, UC-4)

- Successful StoreKit purchase → entitlement recorded server-side, pack becomes downloadable.
- StoreKit transaction fails/cancels → no entitlement created, user sees a clear error, no partial download.
- Attempting to "buy" an already-owned pack → app recognizes existing entitlement, offers download instead of a duplicate charge.
- Restore purchases on a fresh install → all previously purchased packs reappear as owned and re-downloadable.
- Entitlement check on `/v1/packs/:slug/download` for a pack the user does not own → request rejected (403), no file served.

### Pack delivery & updates (UC-8)

- New pack version published → app detects version mismatch via manifest and prompts/auto-downloads the update.
- Corrupted or interrupted pack download → checksum mismatch detected, download retried, local data not corrupted.
- App version below minimum supported → app surfaces an update-required state.

### Admin: framework & pack building (UC-9, UC-12, UC-13)

- Defining a required field on a pack framework, then building the pack without that field present on all POIs → build fails with a clear report of which POIs are missing it.
- Rebuilding a standard pack after adding a new POI of that type to the master DB → new POI appears in the next `pack_version`.
- Building a state pack → includes POIs of all types located in that state, each retaining its own pack-of-origin filters.

### Admin: import pipeline (UC-11)

- Import file missing a field required by the target pack's framework → import halts immediately, error names the missing field.
- Import row with an invalid/missing optional value (e.g. malformed phone) → row flagged for manual correction, rest of the import proceeds.
- Import row with unresolvable address → geocode_status = 'failed', POI saved but excluded from pack builds until corrected.
- Successful import → all valid rows geocoded, added to master DB, available for the next pack build.

---

## 10. Development Phases

| Phase | Goal | Key deliverables |
|-------|------|-------------------|
| **0 — Foundations** | Prove the core mechanic end-to-end | VPS service scaffold (`wowm-api` + `wowm-db`, nginx site); Apple Developer setup (App ID, Sign in with Apple, StoreKit sandbox); iOS app shell (Expo); MapKit route + radius search against a small hardcoded POI set — no packs, no IAP yet |
| **1 — Single Pack MVP** | One real pack, working offline search | Seed one real pack (e.g. Waffle House) in the master DB; authenticated (non-paywalled) download; on-device SQLite storage; local linear-scan radius search; pack-specific filters UI; POI detail view with `additional_info` |
| **2 — Commerce** | Real purchases | StoreKit product per pack; purchase flow; server-side receipt verification via App Store Server API; entitlements; restore purchases; download gated by entitlement |
| **3 — Multi-Pack** | Support owning/using several packs | Second pack purchasable; pack-selection UI; filter area grouped by pack with inactive packs grayed out; app/pack update-check and re-download flow |
| **4 — State Packs & Pack Tooling** | Admin can author and build packs | `poi_types`; pack framework builder (fields/filters) in admin web app; pack build/rebuild tool (master → snapshot → new `pack_version`); first state pack |
| **5 — Import Pipeline** | Scale data entry beyond manual add | Admin file import UI; validation (flag invalid/missing, hard-stop on missing required field); geocoding step; import status/error reporting |
| **6 — Polish & Launch** | Ready for App Store | App Store submission assets (screenshots, privacy nutrition label for location + IAP); real-pack-size performance testing on local search — **revisit spatial indexing (SQLite R-tree) here if linear scan is too slow at real data volumes**; VPS monitoring/backup coverage extended to `wowm-db` |

---

## Open items for future discussion

- Exact UI/UX flows (wireframes) for route search, pack selection, and POI detail.
- Pricing tiers per pack / state pack.
- Whether admin auth is a separate, simpler mechanism (e.g. single shared login) given single-admin usage in early phases.
- App Store metadata: privacy labels, required disclosures for location use and in-app purchases.
