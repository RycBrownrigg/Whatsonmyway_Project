# Coding Conventions

**Analysis Date:** 2026-09-20

## Naming Patterns

**Files:**
- TypeScript source files: `.ts` extension (not `.js`)
- Database schema file: `src/db/schema.ts`
- Server entry point: `src/server.ts`
- No file-naming conventions for new services/handlers yet — establish per route/service scope

**Database Fields (PostgreSQL / Drizzle ORM schema):**
- Column names: `snake_case` (e.g., `apple_sub`, `created_at`, `poi_type_id`)
- Constraints and references follow snake_case (e.g., `pois_poi_type_idx`)
- Enums defined inline in Drizzle as `enum: [...]` (e.g., `{ enum: ['draft', 'published', 'deprecated'] }`)
- Current version tracking: `currentVersion` (Drizzle property) → `current_version` (SQL column)

**TypeScript/Drizzle Properties:**
- Schema exports: `camelCase` (e.g., `appleSub`, `createdAt`, `poiTypeId`)
- Table exports: PascalCase singular or plural (e.g., `users`, `poiTypes`, `packs`, `entitlements`)
- No abbreviations in property names (use `poiTypeId` not `ptId`, `appleSub` not `apSub`)

**Functions/Routes:**
- Handler naming: not yet established (no route handlers written)
- Service functions: not yet established
- Utility functions: not yet established
- Error codes: SCREAMING_SNAKE_CASE per error taxonomy (e.g., `NETWORK_UNAVAILABLE`, `ENTITLEMENT_REVOKED`, `ADDRESS_NOT_FOUND`)

**Variables:**
- Constants: `camelCase` or `SCREAMING_SNAKE_CASE` (lowercase constants for module-scope defaults, uppercase for immutable enums/error codes)
- Loop variables: standard (`i`, `j` for array iteration; descriptive names otherwise)
- Booleans: prefix with `is` (e.g., `isActive`, `isRequired`) — see schema: `isRequired: boolean(...)` 

**Types/Interfaces:**
- Not yet defined in API (schema-driven types via Drizzle)
- When added: PascalCase (e.g., `UserPayload`, `PackResponse`)
- Avoid generic `T`, `U`, `V` in public APIs; use descriptive names (`TRequest`, `TResponse` only in very generic contexts)

## Code Style

**Formatting:**
- No `.eslintrc`, `.prettierrc`, or `biome.json` configured yet
- Default: 2-space indentation (inferred from package.json setup)
- Strict TypeScript: `strict: true` in `tsconfig.json` (§ Configuration below)
- No semicolons enforcement yet (Fastify/Node.js ecosystem convention: optional)

**Linting:**
- Not yet configured — add ESLint + Prettier as a Phase 2 task
- Recommended: `eslint-config-next` for consistency if Next.js admin app added, `eslint-config-prettier` to avoid conflicts

**Import Organization:**
- Third-party imports before local imports (not yet enforced)
- Drizzle schema imports: use named exports (e.g., `import { users, packs } from './src/db/schema'`)
- dotenv: always imported first with `import 'dotenv/config'` to load `.env` early (see `src/server.ts`, `drizzle.config.ts`)

## Error Handling

**Error Codes:**
- Machine codes: SCREAMING_SNAKE_CASE (e.g., `NETWORK_UNAVAILABLE`, `CHECKSUM_MISMATCH`, `ENTITLEMENT_NOT_FOUND`, `ADDRESS_NOT_FOUND`)
- Codes are defined in Product Specification.md §15 (Error Taxonomy)
- Each error carries: code + user-facing message + suggested action
- Import source: not yet established (will likely be `src/errors/codes.ts` or similar)

**Download Errors** (client-facing, per spec):
- `NETWORK_UNAVAILABLE` — user message: "Check your connection and try again"
- `CHECKSUM_MISMATCH` — auto-retry once, then manual
- `ENTITLEMENT_NOT_FOUND` (403) — "This pack isn't linked to your account"
- `ENTITLEMENT_REVOKED` — distinct from NOT_FOUND to avoid misleading restore
- `STORAGE_FULL` — "Not enough space to download this pack"
- `SERVER_UNAVAILABLE` (5xx) — "Trouble on our end — try again shortly"

**Geocoding Errors** (admin-facing):
- `ADDRESS_NOT_FOUND` — zero matches from provider
- `ADDRESS_AMBIGUOUS` — multiple candidates stored in `geocode_candidates`
- `LOW_CONFIDENCE_MATCH` — below threshold, flagged for review
- `PROVIDER_ERROR` — rate-limited or transient

**Import Errors**:
- Row-level (`import_row_errors`): `MISSING_OPTIONAL_FIELD`, `INVALID_FORMAT`, `GEOCODE_FAILED`, `DUPLICATE_SUSPECTED`
- File-level (hard stop): `MISSING_REQUIRED_COLUMN`, `UNREADABLE_FILE`

**Current Error Handling Pattern:**
- Fastify uses built-in `app.log.error(err)` for unhandled errors (see `src/server.ts`)
- Return shape not yet defined — design when implementing route handlers

## Logging

**Framework:** Fastify's built-in Pino logger (enabled by `Fastify({ logger: true })`)

**Pattern:**
- Use `app.log.info()`, `app.log.warn()`, `app.log.error()` for structured logging
- Example (already in use): `app.log.error(err)` on startup failure (`src/server.ts`)
- Pino supports child loggers for request-scoped context (not yet used)

**When to Log:**
- Startup/shutdown events
- External API calls (Smarty, App Store Server API, Stripe/payments)
- Database migrations / schema changes
- Authentication flows (token issuance, refresh, revocation)
- Error cases with error codes
- Do NOT log sensitive data (API keys, user tokens, PII beyond user ID)

## Comments

**When to Comment:**
- Complex algorithms (e.g., bounding-box + haversine search, pack version matching)
- Non-obvious business logic (e.g., why we store geocode candidates instead of auto-picking)
- Workarounds for known issues (none yet — add as they arise)
- Avoid comments restating what code already says (`const id = uuid()` does not need a comment)

**JSDoc/TSDoc:**
- Not yet applied
- When schema types are exported for API responses, add JSDoc comments to describe intent
- Example pattern (for future use):
  ```typescript
  /**
   * User with authentication metadata.
   * @property appleSub - Sign in with Apple subject identifier
   * @property email - Apple account email
   */
  export type UserResponse = typeof users.$inferSelect;
  ```

## Function Design

**Size:**
- Not yet enforced
- Guideline: route handlers should be small, delegating business logic to service functions
- Service functions should be single-purpose (e.g., `verifyAppleTransaction()` does not also create user)

**Parameters:**
- Avoid boolean parameters (use enums or explicit object options)
- Avoid long parameter lists; use objects for related params (e.g., `{ startLat, startLng, endLat, endLng }` → `{ start: { lat, lng }, end: { lat, lng } }`)
- Type all parameters explicitly (strict TypeScript required)

**Return Values:**
- Use Zod schemas for response validation (already added as dependency)
- Async functions: return `Promise<T>` explicitly
- Use Result/Either types for business logic errors (not yet implemented — design before Phase 1)

## Module Design

**Exports:**
- Use named exports (not default exports) to enable better tree-shaking and refactoring
- Schema: already uses named exports (`export const users`, `export const packs`, etc.)

**Barrel Files:**
- Not yet used (minimal code)
- May add in Phase 1 for service layer (e.g., `src/services/index.ts` exporting all services)

**Database Access:**
- All database queries go through Drizzle ORM (never raw SQL in application code)
- Drizzle config: `src/db/schema.ts`, migrations in `drizzle/` directory
- Relation patterns: not yet defined (add query builders as needed per route)

## Configuration

**Environment Variables:**
- Loaded via `dotenv` (see `import 'dotenv/config'` pattern in `src/server.ts`)
- `.env` file required (copy from `.env.example`)
- Required vars (from docker-compose and drizzle.config.ts):
  - `DATABASE_URL` — PostgreSQL connection string
  - `PORT` — API port (default 3003)
  - `HOST` — bind address (default 0.0.0.0)
- Secrets (Apple App Store key, JWT signing key, Smarty API key): added to `api/.env` per VPS plan

**Validation Pattern:**
- Use Zod for request/response validation (dependency already added)
- Example (for future use):
  ```typescript
  import { z } from 'zod';
  const AppleTokenPayload = z.object({
    identityToken: z.string(),
  });
  ```

---

*Convention analysis: 2026-09-20*
