# Testing Patterns

**Analysis Date:** 2026-09-20

## Test Framework

**Status:** Not yet configured.

**Recommended Setup (to implement):**
- Runner: `vitest` (lightweight, TypeScript-first, plays well with Fastify)
- Assertion library: `chai` or `node:assert` (vitest includes assert out of the box)
- Recommended packages: `@vitest/ui` for visual test runner, `msw` for API mocking (if needed)

**Proposed Run Commands** (not yet in package.json):
```bash
npm test              # Run all tests once
npm run test:watch   # Watch mode
npm run test:ui      # Visual dashboard
npm run test:coverage # Generate coverage report
```

## Test File Organization

**Recommended Location:**
- Co-located with source files (not separate `__tests__` directory)
- Naming: `*.test.ts` or `*.spec.ts` (either works; recommend `.test.ts` for consistency)
- Examples (when written):
  - `src/db/schema.test.ts` — schema migration and type inference tests
  - `src/server.test.ts` — startup and healthz endpoint
  - `src/routes/auth.test.ts` — authentication endpoints
  - `src/services/user.test.ts` — user service logic

**Directory Structure** (to adopt):
```
api/
├── src/
│   ├── db/
│   │   ├── schema.ts
│   │   └── schema.test.ts          (if DB type inference tested)
│   ├── routes/
│   │   ├── auth.ts                 (when created)
│   │   └── auth.test.ts
│   ├── services/
│   │   ├── user.ts                 (when created)
│   │   └── user.test.ts
│   └── server.ts
├── test/
│   └── fixtures/                   (shared fixtures/factories across tests)
└── vitest.config.ts                (when added)
```

## Test Structure

**Recommended Suite Organization** (not yet implemented):
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';

describe('Auth Routes', () => {
  let app;

  beforeEach(async () => {
    app = Fastify();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('exchanges Apple identity token for access token', async () => {
    // test body
  });
});
```

**Patterns to Adopt:**
- One `describe` block per route file or service
- One `it` block per test case
- Use `beforeEach` / `afterEach` for test setup/teardown (DB seeding, app startup)
- Use `vi.spyOn()` for mocking Fastify methods or external calls (Smarty, App Store API)

## Test Types & Coverage

**Unit Tests:**
- Scope: individual functions (utility, validation, business logic)
- Approach: mock external dependencies (database, external APIs)
- Examples:
  - Zod schema validation edge cases
  - Error code mapping / message generation
  - Route parameter parsing / query validation
- When to write: before Phase 1 exit criteria (benchmark + tests)

**Integration Tests:**
- Scope: routes + Drizzle queries against a test database
- Approach: spin up PostgreSQL test container (or use PG test database), run migrations, seed test data
- Examples (per spec test cases):
  - `/v1/auth/apple` with valid/invalid identity token
  - `/v1/packs` lists published packs correctly
  - `/v1/purchases/verify` verifies transaction and creates entitlement
  - `/v1/entitlements` returns only non-revoked packs
- When to write: after each Phase endpoint is implemented

**End-to-End Tests:**
- Scope: full app workflow (no mocking external APIs)
- Status: deferred to Phase 2 or later (app-level E2E tests will be on device, outside this API scope)
- If added for API: integration tests ARE the primary E2E for the backend

## Test Structure from Product Specification

**Use-Case Format** (from Product Specification.md):
```
Scenario: [Short title]
- Given: [Initial state]
- When: [User action]
- Then: [Expected outcome]
```

**Test Case Examples** (from spec, to implement):

### Route Search with Multiple Packs
```typescript
it('returns POIs from all active packs within radius', async () => {
  // Given: two packs installed and active, each with POIs within range
  const pack1 = await createTestPack('pack-1', 'Waffle Houses');
  const pack2 = await createTestPack('pack-2', 'Gas Stations');
  const poi1 = await createTestPOI(pack1.id, { lat: 40.7128, lng: -74.0060 });
  const poi2 = await createTestPOI(pack2.id, { lat: 40.7160, lng: -74.0070 });
  
  // When: user searches route from (40.7100, -74.0080) to (40.7200, -74.0040), radius 5 mi
  const response = await app.inject({
    method: 'POST',
    url: '/v1/search/route',
    payload: { startLat: 40.7100, startLng: -74.0080, endLat: 40.7200, endLng: -74.0040, radiusMiles: 5 },
  });
  
  // Then: result includes POIs from both packs, correctly attributed
  expect(response.statusCode).toBe(200);
  expect(response.json().results).toHaveLength(2);
  expect(response.json().results).toContainEqual(expect.objectContaining({ packId: pack1.id }));
  expect(response.json().results).toContainEqual(expect.objectContaining({ packId: pack2.id }));
});
```

### Pack Deactivation
```typescript
it('removes deactivated pack POIs from results', async () => {
  // Given: pack is active with POIs shown
  const pack = await createTestPack('active-pack', 'Restaurants');
  await activatePack(pack.id, userId);
  
  // When: user deactivates that pack
  await app.inject({
    method: 'POST',
    url: '/v1/packs/deactivate',
    payload: { packId: pack.id },
  });
  
  // Then: POIs disappear, filters remain visible but grayed out
  const response = await app.inject({
    method: 'GET',
    url: '/v1/packs/active',
  });
  expect(response.json().activePacks).not.toContainEqual(expect.objectContaining({ id: pack.id }));
  expect(response.json().availableFilters).toContainEqual(expect.objectContaining({ packId: pack.id, disabled: true }));
});
```

### Error Case: Download with Revoked Entitlement
```typescript
it('rejects pack download if entitlement revoked', async () => {
  // Given: pack was purchased but entitlement revoked
  const pack = await createTestPack('expired-pack', 'Old Data');
  const entitlement = await createTestEntitlement(userId, pack.id);
  await revokeEntitlement(entitlement.id);
  
  // When: user attempts download
  const response = await app.inject({
    method: 'GET',
    url: `/v1/packs/${pack.slug}/download`,
    headers: { authorization: `Bearer ${accessToken}` },
  });
  
  // Then: 403 with ENTITLEMENT_REVOKED error code
  expect(response.statusCode).toBe(403);
  expect(response.json()).toEqual({
    code: 'ENTITLEMENT_REVOKED',
    message: 'This pack is no longer available on your account',
  });
});
```

## Mocking

**External Dependencies to Mock:**
- Apple App Store Server API (token verification, transaction lookup)
- Smarty geocoding service
- Fastify methods (hooks, plugins) if testing route isolation

**Mocking Approach** (to adopt):
```typescript
import { vi } from 'vitest';

// Mock external service
vi.mock('./src/services/apple', () => ({
  verifyTransaction: vi.fn(),
}));

// In tests:
import * as appleService from './src/services/apple';
appleService.verifyTransaction.mockResolvedValue({ status: 'valid' });
```

**What NOT to Mock:**
- Drizzle ORM queries (use test database)
- Zod schema validation (test actual validation rules)
- Fastify server / request/response objects (test against real server)

## Test Fixtures and Factories

**Test Data Generation** (to implement):
Create factory functions for common test objects in `test/fixtures/`:

```typescript
// test/fixtures/packs.ts
export async function createTestPack(slug: string, name: string) {
  return db.insert(packs).values({
    slug,
    name,
    packType: 'standard',
    appleProductId: `com.example.${slug}`,
    status: 'published',
  }).returning();
}

// test/fixtures/pois.ts
export async function createTestPOI(packId: uuid, { lat, lng, name = 'Test POI' }) {
  return db.insert(pois).values({
    poiTypeId: defaultPoiTypeId,
    name,
    addressStreet: '123 Main St',
    addressCity: 'Test City',
    addressState: 'CO',
    addressZip: '80202',
    latitude: lat,
    longitude: lng,
    geocodeStatus: 'ok',
    geocodeConfidence: 0.95,
  }).returning();
}
```

**Database Setup for Tests:**
- Spin up PostgreSQL in test environment (Docker, or pgvector for CI)
- Run migrations fresh for each test suite (or per-test if isolation needed)
- Seed known fixtures at suite startup
- Clean up after suite completes

## Coverage

**Target:** Not yet defined — propose:
- Minimum: 80% for critical paths (auth, purchases, entitlements)
- Nice-to-have: 90% overall
- Exclude: database migrations (Drizzle handles), third-party integrations (mocked)

**View Coverage:**
```bash
npm run test:coverage
# Generates coverage/ directory with HTML reports
```

## Error Code Test Cases

**Every error code from spec §15 should have at least one test:**

### Download Errors
- `NETWORK_UNAVAILABLE` — simulate failed fetch to file storage
- `CHECKSUM_MISMATCH` — verify file, corrupt it, re-download
- `ENTITLEMENT_NOT_FOUND` (403) — request without entitlement
- `ENTITLEMENT_REVOKED` — request with revoked_at set
- `STORAGE_FULL` — (app-level test, not API)
- `SERVER_UNAVAILABLE` (5xx) — simulate 5xx response

### Geocoding Errors (admin workflow)
- `ADDRESS_NOT_FOUND` — import POI with no Smarty match
- `ADDRESS_AMBIGUOUS` — import POI with multiple candidates
- `LOW_CONFIDENCE_MATCH` — import POI below confidence threshold
- `PROVIDER_ERROR` — mock Smarty rate limit / timeout

### Import Errors
- `MISSING_REQUIRED_COLUMN` — CSV missing name column
- `UNREADABLE_FILE` — malformed CSV
- `MISSING_OPTIONAL_FIELD` — address_zip empty
- `INVALID_FORMAT` — latitude not a number
- `GEOCODE_FAILED` — Smarty returns error for row
- `DUPLICATE_SUSPECTED` — normalized address matches existing POI

## Test Phases

**Phase 0 (Foundations):**
- Minimal: just healthz endpoint + server startup test

**Phase 1 (Single Pack MVP):**
- Add test suite for:
  - `/v1/packs` listing and detail
  - `/v1/auth/apple` token exchange
  - `/v1/purchases/verify` transaction validation
  - Bounding-box + haversine search accuracy against benchmark POI set (10k synthetic)
- Multi-pack performance benchmark (exit criteria per spec)

**Phase 2 (Commerce):**
- Add test suite for:
  - Entitlement lifecycle (purchase → revoke)
  - `/v1/entitlements` filtering
  - `/v1/webhooks/app-store-notifications` webhook parsing
- All error codes from commerce workflow

**Phase 3+ (Multi-Pack, Imports, Polish):**
- Route-specific tests for new endpoints
- Geocoding pipeline tests
- Import error handling tests

---

*Testing analysis: 2026-09-20*
