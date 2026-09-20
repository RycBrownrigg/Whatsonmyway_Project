# External Integrations

**Analysis Date:** 2026-09-20

## APIs & External Services

**Apple Ecosystem (Authentication & Payments):**
- **Sign in with Apple** - User authentication
  - Integration point: `POST /v1/auth/apple` endpoint (backend receives identity token from client)
  - Database field: `users.apple_sub` (subject claim, unique identifier)
  - Session method: JWT (access token + rotating refresh token)
  - Env var: `APPLE_*` (Sign in with Apple credentials, not read from `.env` due to security policy)

- **Apple StoreKit 2** - In-app purchase (client-side)
  - Framework: React Native IAP or Expo StoreKit 2 bindings (planned, `app/` not yet scaffolded)
  - Product type: Non-consumable IAP products
  - Each pack maps to one `apple_product_id` (stored in `packs.apple_product_id`)
  - Client submits completed transaction to backend for verification

- **Apple App Store Server API** - Server-side receipt/transaction verification
  - Integration point: `POST /v1/purchases/verify` endpoint (backend verifies StoreKit transaction)
  - Validates transaction authenticity and timestamp
  - Creates or updates entitlements in `entitlements` table with `appleOriginalTransactionId` and `appleTransactionId`
  - Detects sandbox vs. production environment
  - Env var: Apple App Store Server API key (`.p8` file, location: `wowm/infra/.env`, not read due to security policy)

- **Apple App Store Server Notifications V2** - Webhook for purchase events
  - Integration point: `POST /v1/webhooks/app-store-notifications` endpoint
  - Events processed: refund, revocation
  - Action: Sets `entitlements.revoked_at` timestamp when user loses access
  - Signature verification: Apple JWS payload signature validated before processing
  - Documentation: [App Store Server Notifications V2](https://developer.apple.com/documentation/appstoreservernotifications)

**Geocoding & Address Standardization:**
- **Smarty** - US address standardization and geocoding
  - Integration point: `POST /v1/admin/pois/:id/geocode` (manual trigger), automatic on POI import
  - Input: Address components (`address_street`, `address_city`, `address_state`, `address_zip`)
  - Output: Standardized address, latitude, longitude, confidence score
  - Stored in `pois` table: `latitude`, `longitude`, `geocode_status`, `geocode_confidence`, `geocode_candidates`
  - Chosen because: Terms permit permanent storage of results (unlike Google's Geocoding API); standardization directly addresses messy third-party data
  - Env var: `SMARTY_API_KEY` (location: `wowm/infra/.env`, not read due to security policy)

**Client-Side Routing:**
- **Apple MapKit** - Route planning and directions (client-side only, no backend integration)
  - Framework: MKDirections (iOS native)
  - Used in app route search: calculates route between user-selected start/end points
  - App samples the route and filters POIs within the selected radius

## Data Storage

**Databases:**
- **PostgreSQL 16**
  - Type: Master database (backend source of truth)
  - Deployment: Docker container (`wowm-db`, `postgres:16-alpine`)
  - Connection: Via `DATABASE_URL` env var (format: `postgres://user:password@host:port/database`)
  - ORM/Client: Drizzle ORM 0.36.4 (with `postgres` v3.4.5 driver)
  - Persistence: Volume mount `wowm_db_data:/var/lib/postgresql/data`
  - Tables: `users`, `poi_types`, `packs`, `pack_field_definitions`, `pack_filter_definitions`, `pois`, `pack_pois`, `pack_versions`, `entitlements`, `imports`, `import_row_errors`, `feedback_submissions`

- **SQLite** (Planned, local device storage)
  - Location: On-device (`app/` — not yet scaffolded)
  - Framework: `expo-sqlite` (planned)
  - Purpose: Offline-first pack data storage; repopulated on pack install/update
  - Schema: Denormalized for fast local reads; includes `installed_packs`, `pack_field_defs`, `pack_filter_defs`, `pois`
  - Never sends user search queries to backend (all search runs locally)

**File Storage:**
- Local filesystem served via authenticated API endpoint
  - Endpoint: `GET /v1/packs/:slug/download` (user + entitlement check required)
  - Delivery: Signed URL or streamed file with `Range` support for resumable downloads
  - Format: Pack files (binary, format versioned via `pack_versions.format_version`)
  - Access control: Requires valid entitlement where `revoked_at IS NULL`

**Caching:**
- Not mentioned in specification or code; each request flows to database

## Authentication & Identity

**Auth Provider:**
- Sign in with Apple
  - Flow: Client requests identity token from Apple Sign in with Apple interface → sends to `POST /v1/auth/apple` endpoint → backend validates and creates session
  - Session type: JWT-based (access token ~1hr lifetime + rotating refresh token)
  - Token refresh: `POST /v1/auth/refresh` with refresh token, issues new access + new refresh token
  - User record: Tied to `apple_sub` (subject claim), nullable `email` field
  - Env config: Apple Sign in with Apple credentials (location: `wowm/infra/.env`)

**Session Management:**
- Method: JWT (access token, refresh token, rotating refresh)
- Storage: Client-side (app); secure storage via `expo-secure-store` (planned)
- Required for: Entitlement queries, purchase verification, pack downloads, feedback submission (optional)

## Monitoring & Observability

**Error Tracking:**
- Not implemented in current codebase; spec does not mention third-party error tracking service

**Logs:**
- Method: Fastify built-in logger (`logger: true` in `api/src/server.ts`)
- Output: Stdout (captured by Docker/container orchestration)
- VPS monitoring: Extend `server-monitor.sh` Docker check to include `wowm-api` and `wowm-db`

**Healthcheck:**
- Endpoint: `GET /healthz` (returns `{ status: 'ok' }`)
- Purpose: Docker container health verification

## CI/CD & Deployment

**Hosting:**
- VPS: `rycsprojects` (Ubuntu 24.04, existing infrastructure shared with `ebay-api`, `ddd-api`)
- Containers: Docker (same pattern as existing services)
- Configuration files: `api/Dockerfile`, `infra/docker-compose.yml`
- API service: `wowm-api` container, bound to `127.0.0.1:3003`
- Reverse proxy: nginx (TLS via certbot, rate limiting via `zone=api` 20r/s, security headers)

**CI Pipeline:**
- Not configured yet (no GitHub Actions, pre-commit hooks, or test CI found)

**Backup:**
- Plan (not yet implemented): Extend `vps-backup.sh` to include `pg_dump` for `wowm-db`

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - PostgreSQL connection string (e.g., `postgres://wowm:wowm@wowm-db:5432/wowm` for local Docker)
- `PORT` - API server port (default: 3003)
- `HOST` - API server bind address (default: 0.0.0.0)

**Secrets location:**
- `.env` file in `wowm/infra/` (not committed to git, managed separately on VPS)
- Secrets managed:
  - `DATABASE_URL` (database credentials)
  - Apple App Store Server API key (`.p8` file path or embedded key)
  - Sign in with Apple configuration (team ID, bundle ID, key ID)
  - JWT signing secret (for access/refresh token signing)
  - Smarty API key
  - Node environment: `NODE_ENV=production` (set in Dockerfile)

## Webhooks & Callbacks

**Incoming:**
- `POST /v1/webhooks/app-store-notifications` - Apple App Store Server Notifications V2
  - Triggers: Purchase, renewal, refund, revocation events
  - Signature: JWS signed by Apple; must verify before processing
  - Processing: Updates `entitlements.revoked_at` on refund/revoke
  - Security: Publicly accessible endpoint but signature-protected

**Outgoing:**
- None mentioned in specification or code

## Cross-Service Communication

**Client ↔ Backend:**
- Protocol: HTTPS (nginx reverse proxy, TLS via certbot)
- Authentication: Bearer token (JWT access token in `Authorization: Bearer` header)
- User agent: iOS app (Expo/React Native), admin web (Next.js static export)

**App ↔ MapKit:**
- Direct client-side integration (no backend proxy needed)

**Backend ↔ External APIs:**
- Smarty (HTTP API, authenticated with API key)
- Apple App Store Server API (HTTPS, authenticated with `.p8` key)
- App Store Server Notifications V2 (webhook, JWS-signed payloads)

---

*Integration audit: 2026-09-20*
