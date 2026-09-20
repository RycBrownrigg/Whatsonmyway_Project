# Codebase Concerns

**Analysis Date:** 2026-09-20

## Critical Path Blockers

### Missing Scaffolding for app/ and admin/

**Issue:** The iOS client (`app/`) and admin web interface (`admin/`) directories do not exist. Per Product Specification.md and CLAUDE.md layout, these should be scaffolded via `create-expo-app` and `create-next-app` respectively.

**Files:** 
- `app/` — does not exist
- `admin/` — does not exist

**Impact:** Blocks Phase 0 (core mechanic proof-of-concept) and Phase 1 (single pack MVP). Without these scaffolds, no frontend development can proceed. Schema exists but UI cannot be built.

**Fix approach:** 
- Run `create-expo-app` to bootstrap `app/` with Expo, TypeScript, Expo Router, NativeWind, expo-sqlite, expo-file-system dependencies per spec §2
- Run `create-next-app` to bootstrap `admin/` with Next.js static export, TypeScript, shadcn/ui, Tailwind per spec §2
- Add to version control as separate commits
- Document in project README any post-scaffold setup steps (SDK integration, env vars, etc.)

## Missing Business Logic & API Routes

### No Endpoint Implementation

**Issue:** `api/src/server.ts` contains only a minimal `/healthz` endpoint. The API specification (Product Specification.md §7) defines 18 endpoints across users, packs, purchases, webhooks, imports, and feedback — none are implemented.

**Files:** `api/src/server.ts` (17 lines, skeleton only)

**Required endpoints missing:**
- `POST /v1/auth/sign-in-with-apple` — user creation/authentication
- `GET /v1/packs` — pack catalog
- `GET /v1/packs/:id/versions` — version manifest
- `GET /v1/packs/:id/versions/:version/file` — authenticated pack download
- `GET /v1/entitlements` — user's owned packs
- `POST /v1/entitlements` — record a new purchase
- `POST /v1/webhooks/app-store-notifications` — handle App Store refund/revoke
- `POST /v1/imports` — admin import batch upload
- `POST /v1/feedback` — in-app feedback submissions
- (11 more per spec §7)

**Impact:** Application is non-functional. No auth, no pack distribution, no payment verification, no admin tooling.

**Fix approach:** 
- Create middleware and service layers first (auth, validation, database queries)
- Implement routes in priority order: auth → pack catalog → purchase verification → pack download → webhooks
- Use Zod schemas for request/response validation
- Structure: `src/routes/`, `src/services/`, `src/middleware/`, `src/lib/`

## Missing Authentication & Security

### No Sign in with Apple Implementation

**Issue:** Product Specification.md §2, §7, §9 specify Sign in with Apple with JWT access + rotating refresh tokens, but no implementation exists. The `users` table schema is present but no auth routes or middleware.

**Files:** 
- `api/src/db/schema.ts` — `users` table defined but unused
- `api/src/server.ts` — no auth routes
- `api/.env.example` — lists `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` but not integrated

**Missing packages:** No `jsonwebtoken`, `apple-signin`, or equivalent library in `package.json`.

**Impact:** 
- Users cannot log in
- User identity cannot be verified
- Entitlements cannot be tied to authenticated sessions
- Pack downloads cannot be gated by user identity

**Fix approach:**
- Add `jsonwebtoken` and `@types/jsonwebtoken` to dependencies
- Implement Apple ID token verification in auth service (verify against Apple's JWKS endpoint)
- Create session/JWT middleware for protected routes
- Add refresh token rotation logic
- Store refresh tokens securely in database (separate table if needed)

### No Input Validation Middleware

**Issue:** Zod is installed but not integrated into the API. No validation middleware exists to validate request bodies, query params, or route parameters.

**Files:**
- `api/package.json` — Zod 3.23.8 installed but never imported in `src/`
- No middleware directory exists

**Impact:** Malformed requests will not be caught, leading to database errors, type safety violations, and potential injection attacks.

**Fix approach:**
- Create `src/middleware/validateRequest.ts` using Zod
- Define schemas for each endpoint's request/response shape
- Mount globally or per-route

### No CORS Configuration

**Issue:** No CORS headers configured. iPad/iPhone app may have cross-origin issues when making API requests from a web context or if admin web interface is on a different origin.

**Impact:** API calls from the admin interface (especially if hosted on a subdomain) may be blocked by browsers.

**Fix approach:**
- Install and configure `@fastify/cors`
- Set `origin` to allowed origins (admin subdomain, localhost for dev)

### No Rate Limiting at Application Level

**Issue:** Product Specification.md §3 mentions rate limiting is "Add `wowm` API locations to existing `zone=api` (20r/s) nginx rate limit," but this is nginx-only. No application-level rate limiting for brute-force protection on auth endpoints.

**Impact:** Auth endpoints vulnerable to credential enumeration or brute-force attacks if nginx rules change or are misconfigured.

**Fix approach:**
- Install `@fastify/rate-limit` or similar
- Apply stricter limits to `POST /v1/auth/*` and `POST /v1/webhooks/*` endpoints

## Test Coverage Gaps

### No Tests Configured

**Issue:** No test framework configured (`jest`, `vitest`, or similar). No test files exist. No `npm test` script defined.

**Files:**
- No `jest.config.js`, `vitest.config.ts`, or similar
- No `*.test.ts` or `*.spec.ts` files in `api/src/`
- `package.json` has no dev dependency for test runner

**Required test coverage (from spec §11, §17):**
- Phase 1 synthetic 10k-POI benchmark (performance)
- Purchase/entitlement verification flow
- Pack file download with Range support
- Import validation and geocoding pipeline
- Route search algorithm (haversine + radius)

**Impact:** 
- No way to ensure correctness as features are added
- Cannot validate performance claims before launch
- Regressions will not be caught
- Difficult to verify complex business logic (purchase verification, webhook handling)

**Fix approach:**
- Add `vitest` + `@vitest/coverage-c8` as dev dependencies
- Create `vitest.config.ts` 
- Establish test file location: `src/**/*.test.ts`
- Create test fixtures for database (test database, seeding)
- Write tests for: auth verification, entitlement checks, pack download, webhooks, import validation

## Database & Deployment Concerns

### Missing Database Initialization in Docker

**Issue:** The `Dockerfile` does not run migrations. Containers can start without the database schema being applied, leading to schema-mismatch runtime errors.

**Files:**
- `api/Dockerfile` — build steps 1-6 do not include `npm run db:migrate`
- `infra/docker-compose.yml` — `wowm-api` has `depends_on: [wowm-db]` but no health check or migration step

**Current flow:** 
1. Container starts, binds to port 3003
2. First request hits a missing table → query fails
3. No graceful migration or error message

**Impact:** First deployment will fail silently. Manual migration step required after container startup.

**Fix approach:**
- Add `RUN npm run db:migrate` to production `Dockerfile` before `CMD`
- Or add a health check that waits for schema to exist before starting the server
- Or use a separate migration container that runs before `wowm-api` starts

### No Database Backup/Disaster Recovery Plan

**Issue:** Product Specification.md §3 states "Extend `vps-backup.sh`: `pg_dump` for `wowm-db`" but this is not implemented in the codebase.

**Files:**
- No backup script in `infra/` or elsewhere

**Impact:** Master POI database (source of truth) has no backup strategy. Data loss on the VPS is catastrophic.

**Fix approach:**
- Create `infra/backup.sh` (or extend existing backup script) to include `pg_dump wowm-db`
- Schedule via cron (daily or weekly)
- Document backup location and retention policy in README

### No Monitoring or Health Check for Database

**Issue:** Product Specification.md §3 mentions "Extend `server-monitor.sh` Docker check to include `wowm-api` / `wowm-db`" but no health check endpoints exist.

**Files:**
- No `/healthz` that includes database connectivity check
- No monitoring integration

**Current state:** `/healthz` only checks Fastify startup, not database readiness.

**Impact:** Monitoring cannot detect database failures. Failed deployments or network issues between API and DB will not trigger alerts.

**Fix approach:**
- Extend `/healthz` to include a simple `SELECT 1` to the database
- Return 500 if database is unreachable
- Document expected response format for monitoring script

## Configuration & Secrets Management

### .env File in Repository (Potential Risk)

**Issue:** An actual `.env` file exists at `api/.env` alongside `.env.example`. If this file contains real secrets, it's a security risk.

**Files:**
- `api/.env` — present, not examined (permission restriction)
- `api/.env.example` — public template

**Note:** File is protected from reading but its existence is flagged. If `.env` contains real credentials, it must not be committed.

**Impact:** If `.env` is committed with real secrets (Apple API keys, JWT signing secret, Smarty API key), those secrets are exposed in git history and anyone with repo access can use them.

**Fix approach:**
- Ensure `.env` is in `.gitignore` (check: `cat .gitignore | grep '\.env'`)
- Remove `.env` from git history if it was accidentally committed: `git rm --cached api/.env && git commit`
- On deployment to VPS, create `.env` from template and fill in actual secrets via secure means (manual entry, encrypted secrets manager, etc.)

### Missing Security Headers & HTTPS Configuration

**Issue:** While Product Specification.md §3 mentions nginx will handle HTTPS and security headers per "existing global config," the API itself has no HSTS, CSP, or other security headers.

**Impact:** If nginx configuration is misconfigured, the API will not enforce HTTPS or provide headers like HSTS, X-Frame-Options, etc.

**Fix approach:**
- Add `@fastify/helmet` to dependencies
- Configure with defaults: HSTS, X-Frame-Options, X-Content-Type-Options, etc.
- Document that nginx should also enforce HTTPS redirects

## Schema & Data Integrity

### Loose Null Handling in Key Fields

**Issue:** Several fields in the `pois` table allow NULL when they should be required:

**Files:** `api/src/db/schema.ts` (lines 73, 76, 159-160)

- `latitude` and `longitude` are `doublePrecision()` without `.notNull()` — a POI without coordinates is useless
- `geocodeCandidates` and `geocodeConfidence` are NULL when `geocodeStatus = 'pending'` but should be validated when status changes to 'ok' or 'low_confidence'

**Impact:** 
- Queries cannot assume coordinates exist, making search code defensive and error-prone
- Pack file generation may include POIs with no location
- Route search will silently skip POIs with NULL coordinates

**Fix approach:**
- Alter `pois.latitude` and `pois.longitude` to `.notNull()` — geocoding must complete before a POI is usable
- Add a constraint: if `geocodeStatus = 'ok'` or `'low_confidence'`, then `geocodeConfidence` must be non-null
- Create a database migration to backfill existing rows (if any) or ensure import process sets these before insertion

### No Address Validation

**Issue:** Address fields in `pois` table allow empty strings or very long strings:

**Files:** `api/src/db/schema.ts` (lines 66-69)

- `addressStreet`, `addressCity`, `addressState`, `addressZip` are `text()` with no length constraints or validation
- `addressState` is `CHAR(2)` but no CHECK constraint validates it's actually a valid US state abbreviation

**Impact:**
- Invalid addresses will be stored and included in pack files
- Geocoding step may fail or produce incorrect confidence scores
- User-visible data quality issues (typos, wrong states, etc.)

**Fix approach:**
- Add length constraints in schema: `addressStreet` max 255, `addressCity` max 100, `addressZip` max 10
- Add CHECK constraint for `addressState`: must be one of the 50 US state abbreviations
- Add validation in import service before inserting POIs
- Reference: Product Specification.md §17 mentions "Pilot import: before committing to a full seed dataset, run 50-100 real addresses through the full pipeline"

### No Constraint on Latitude/Longitude Ranges

**Issue:** Latitude/longitude fields accept any `doublePrecision` value, even invalid coordinates.

**Files:** `api/src/db/schema.ts` (lines 73-74)

**Valid ranges:**
- Latitude: -90 to +90
- Longitude: -180 to +180

**Impact:** Typos (e.g., 1000.0 for latitude) will not be caught, leading to invalid data in pack files and broken searches.

**Fix approach:**
- Add CHECK constraints in schema for each:
  ```sql
  CHECK (latitude >= -90 AND latitude <= 90)
  CHECK (longitude >= -180 AND longitude <= 180)
  ```
- Or validate in application code before insert/update

## Missing Implementation Details

### Smarty Geocoding Integration Not Started

**Issue:** Product Specification.md §2 lists Smarty as the geocoding service. No code exists to call Smarty API, validate addresses, or handle geocoding responses.

**Files:**
- Schema fields exist (`geocodeStatus`, `geocodeConfidence`, `geocodeCandidates`) but no Smarty SDK/client
- No `src/services/geocoding.ts` or similar

**Missing:**
- Smarty API client setup
- Address standardization logic
- Confidence threshold handling
- Ambiguous-address candidate logic (storing `geocodeCandidates` JSONB)

**Required for Phase 1:** "Smarty adapter + pilot import (50-100 addresses)" — this is blocking.

**Fix approach:**
- Install `smarty-sdk` or build HTTP client for Smarty
- Create `src/services/smarty.ts` with functions:
  - `standardizeAndGeocode(address)` → returns `{ latitude, longitude, confidence, status, candidates? }`
  - `matchGeocodeStatus()` based on confidence score
- Call from import service during Phase 1 pilot
- Document handling of ambiguous addresses (for manual selection in admin UI)

### App Store Server API Integration Not Started

**Issue:** Product Specification.md §2, §9 specify server-side purchase verification via "App Store Server API + App Store Server Notifications V2" but no code exists.

**Files:**
- `entitlements` table schema exists but no routes or services to populate it
- `.env.example` lists `APPLE_APP_STORE_SERVER_KEY` but not integrated

**Missing:**
- Code to verify StoreKit transactions received from the iOS app
- Webhook endpoint to handle App Store Server Notifications V2 (refund/revoke events)
- Logic to set `entitlements.revoked_at` when a refund is issued

**Required for Phase 2:** "Real purchases" — currently blocked.

**Impact:** 
- App cannot verify purchase authenticity
- No server-side record of entitlements
- Refunds/revokes cannot be enforced
- Users could have free access to paid packs by spoofing transactions

**Fix approach:**
- Install `node-apple-receipt-verify` or equivalent
- Create `src/services/appStore.ts`:
  - `verifyTransaction(transactionInfo, bundleId)` → returns verified user/pack ID
  - Webhook handler for App Store Server Notifications V2
- Create routes:
  - `POST /v1/entitlements` (app sends transaction, API verifies and records)
  - `POST /v1/webhooks/app-store-notifications` (App Store sends refund/revoke events)
- Document webhook payload schema from Apple's documentation

### Pack File Generation Pipeline Not Implemented

**Issue:** Product Specification.md §10 describes a pack file generation process:
1. Select POIs for a pack (by poi_type or state)
2. Build denormalized SQLite file with POI data + field/filter definitions
3. Store with version/checksum metadata
4. Serve authenticated downloads with Range header support

No code exists for steps 1-4.

**Files:**
- `pack_versions` and `pack_pois` tables exist but unused
- No pack file builder service
- No download endpoint

**Impact:** Cannot create deliverable pack data for the iOS app. Phase 1 and beyond blocked.

**Fix approach:**
- Create `src/services/packBuilder.ts`:
  - Query `pack_pois` + `pois` + field/filter definitions
  - Generate SQLite file matching on-device schema (Product Specification.md §5)
  - Compute checksum
  - Store file and metadata
- Create endpoint:
  - `GET /v1/packs/:id/versions/:version/file` with `Range` support (for resumable downloads)
  - Validate user entitlement before returning
- Document pack file format versioning and migration strategy

## Fragile Areas & Future Refactoring

### Route Search Algorithm Not Validated

**Issue:** Local spatial search (haversine + bounding box) is deferred to Phase 1 benchmark, but Product Specification.md §20 says "SQLite R-tree spatial index if Phase 1 benchmark shows the bounding-box approach insufficient."

**Files:**
- No iOS app yet so no search implementation
- No benchmark suite

**Risk:** 
- Search may be too slow on real packs (thousands of POIs across multiple packs)
- Requires device-level optimization work that may be hard to backport
- May need R-tree index addition, which breaks app's on-device schema version

**Fix approach (Phase 1):**
- Implement basic haversine search first (no index)
- Create benchmark: generate synthetic 10k-POI pack, measure search time with 1/2/3 packs active
- If > 500ms on iPhone 13 base model, move to R-tree index
- Document benchmark results and decision in Product Specification.md §10

### App-Level Dependency on NativeWind/Tailwind CSS

**Issue:** Admin and iOS apps both depend on Tailwind/NativeWind, but Tailwind CSS is a large dependency and configuration can be fragile across versions.

**Impact:** 
- Styling bugs are common with Tailwind + React Native integration
- Future updates to NativeWind may break layouts
- No fallback UI framework if Tailwind integration fails

**Mitigation:** 
- Keep NativeWind version pinned in `app/package.json`
- Admin uses standard Tailwind + shadcn/ui (more stable)
- Establish visual regression testing early (Phase 2+)

## Missing Documentation

### No API Documentation or Specification

**Issue:** Product Specification.md §7 lists all 18 API endpoints, but there is no OpenAPI/Swagger spec generated from code. Each endpoint's request/response schema is not documented in machine-readable form.

**Impact:** 
- iOS app developers will have to read the spec document manually
- Admin interface will lack auto-generated API client
- Webhooks are hard to test without a reference

**Fix approach:**
- Install `@fastify/swagger` and `@fastify/swagger-ui`
- Define endpoint schemas as Zod schemas + FastifySchema
- Generate OpenAPI at startup
- Expose at `GET /docs` for development

### No Development or Deployment Guide

**Issue:** No README or DEPLOYMENT.md exists explaining:
- How to set up local dev environment
- How to run tests
- How to deploy to VPS
- How to manage secrets
- How to handle migrations in production

**Impact:** Other team members (or future self) will struggle to get the app running or deploy changes.

**Fix approach:**
- Create `README.md` with:
  - Project overview
  - Tech stack summary
  - Local setup steps (clone, npm install, docker-compose up)
  - Run/test commands
- Create `DEPLOYMENT.md` with:
  - VPS setup (creating wowm-api container, configuring nginx)
  - Secret management (where to put `.env` on VPS)
  - Database migration strategy
  - Rollback procedure

---

*Concerns audit: 2026-09-20*
