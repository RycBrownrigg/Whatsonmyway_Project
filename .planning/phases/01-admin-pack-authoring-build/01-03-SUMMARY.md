---
phase: 01-admin-pack-authoring-build
plan: 03
subsystem: admin-poi-geocoding
tags: [admin, api, fastify, drizzle, zod, smarty, geocoding, react-hook-form, shadcn, vitest]
dependency-graph:
  requires:
    - api/src/db/client.ts (db)
    - api/src/middleware/adminAuth.ts (adminAuthPreHandler)
    - api/src/routes/admin/index.ts (registerAdminRoutes)
    - api/src/routes/admin/packs.ts (registerPackRoutes — packs.poiTypeId)
    - api/test/setup.ts (testDb, resetDb, buildTestApp, ADMIN_TOKEN_FOR_TESTS)
    - admin/lib/api.ts (apiCall, packApi — 01-01/01-02 base)
  provides:
    - api/src/utils/errors.ts (AppError, GEOCODING_ERROR_CODES)
    - api/src/services/geocoding.ts (geocodeAddress, normalizeAddressKey, AddressInput, GeocodeCandidate, GeocodeResult)
    - api/src/routes/admin/poiTypes.ts (registerPoiTypeRoutes, CreatePoiTypeSchema)
    - api/src/routes/admin/pois.ts (registerPoiRoutes, CreatePoiSchema)
    - admin/components/GeocodeStatusBadge.tsx (GeocodeStatusBadge)
    - admin/app/packs/pois/page.tsx (POI list)
    - admin/app/packs/pois/new/page.tsx (Add POI form)
    - admin/lib/api.ts (poiApi, poiTypeApi, Poi, PoiType, CreatePoiInput, CreatePoiTypeInput, CreatePoiResponse)
  affects:
    - api/src/routes/admin/index.ts (registers registerPoiTypeRoutes, registerPoiRoutes)
    - admin/app/packs/detail/page.tsx (adds a "POIs" link)
    - admin/app/packs/page.tsx (adds a POI-type Select + inline create affordance to the pack create form)
tech-stack:
  added: []
  patterns:
    - Thin-adapter isolation (§17) — "smarty"/Smarty host string appears in exactly one file (api/src/services/geocoding.ts); a negated grep gates the admin build and is asserted directly in the route/service test suites
    - Zod-parse-before-touch (T-01-06) — the Smarty response is validated against a Zod schema before any field is read, so a malformed payload becomes PROVIDER_ERROR rather than a bad coordinate reaching Postgres
    - Retry-then-surface (§15) — geocodeAddress retries a non-2xx/aborted/malformed response twice (250ms, 1000ms) before returning PROVIDER_ERROR; the admin never sees a transient failure directly
    - Save-and-flag, never reject (UC-12 step 5) — a failed/low-confidence geocode still inserts the pois row (status flagged, geocode_status carrying the real outcome); only a route-level AppError (missing credentials) or a 400/404 on the request itself blocks the insert
    - Defense-in-depth on JSONB keys (T-01-14) — customFields/filterValues keys are rejected unless they match a saved field/filter definition for a pack built on the POI's poi_type_id, on top of the upstream fieldKey/filterKey regex from plan 01-02
key-files:
  created:
    - api/src/utils/errors.ts
    - api/src/services/geocoding.ts
    - api/src/services/geocoding.test.ts
    - api/src/routes/admin/poiTypes.ts
    - api/src/routes/admin/pois.ts
    - api/src/routes/admin/pois.test.ts
    - admin/components/GeocodeStatusBadge.tsx
    - admin/app/packs/pois/page.tsx
    - admin/app/packs/pois/new/page.tsx
    - admin/components/ui/badge.tsx
    - admin/components/ui/textarea.tsx
    - admin/components/ui/switch.tsx
  modified:
    - api/src/routes/admin/index.ts
    - api/.env.example
    - admin/lib/api.ts
    - admin/app/packs/detail/page.tsx
    - admin/app/packs/page.tsx
decisions:
  - "Smarty precision-grade bucketing (rooftop/block/ZIP-centroid) in geocoding.ts's scoreCandidate is this executor's own documented assumption, not a value copied from a live Smarty docs lookup — Context7 MCP was unavailable and the ctx7 CLI fallback was not installed in this environment (installing it would itself be a new-package action requiring a legitimacy checkpoint, out of proportion for a docs lookup). Zip9=rooftop(1.0), Zip8/Zip7/Zip6=block(0.8), Zip5=ZIP-centroid(0.3), dpv_match_code S/D=0.5, dpv_match_code N=0.0 regardless of precision. Every behavior the plan specifies (inclusive threshold boundary, ambiguous-null-coordinates, exhausted-retry PROVIDER_ERROR, malformed-payload PROVIDER_ERROR) is covered by tests that fully control the mocked Smarty response shape, so this bucketing doesn't affect test correctness — only real-world scoring accuracy once live Smarty responses are seen. Flagged here for the pilot import (§17) to confirm or correct."
  - "T-01-14's mitigation ('rejects any submitted key that does not match a saved field or filter definition for the pack') was implemented in pois.ts even though the plan's own Task 2 <action> text didn't spell it out — the threat model assigns this file a 'mitigate' disposition for exactly this control, so it's applied per the executor's Rule 2 (auto-add missing critical functionality) rather than skipped as out-of-scope."
  - "Both api/ and admin/ needed a fresh npm ci in this worktree before any test/build could run — node_modules didn't exist yet in this checkout. Ran from each package's own lockfile (no new packages introduced), consistent with the package-manager-install exclusion from Rule 3 auto-fix (this is materializing already-declared/locked dependencies, not adding new ones)."
metrics:
  duration: "~70 minutes"
  completed: "2026-09-21"
status: complete
actuals:
  tokens: 16700
  tasks: 3
  commits: 3
---

# Phase 1 Plan 3: Admin POI Entry & Geocoding Summary

Gave the admin a way to put real, geocoded points of interest into the master database: a
Smarty-behind-a-thin-adapter geocoding service with the full §15 error taxonomy, a POI type
registry, an authenticated POI create endpoint that geocodes on save and never fabricates or
auto-resolves an address, and the POI list / Add POI browser screens with geocode status badges.

## What Was Built

- **`api/src/utils/errors.ts`** — `AppError` (statusCode/code/message) and a frozen
  `GEOCODING_ERROR_CODES` taxonomy for `ADDRESS_NOT_FOUND`, `ADDRESS_AMBIGUOUS`,
  `LOW_CONFIDENCE_MATCH`, `PROVIDER_ERROR` per Product Specification.md §15.
- **`api/src/services/geocoding.ts`** (§17) — the only module in `api/src/` naming Smarty.
  `geocodeAddress` issues one GET to the US Street Address API with `AbortSignal.timeout(5000)`,
  Zod-parses the response before touching any value, and retries a non-2xx/aborted/malformed
  response twice (250ms then 1000ms backoff) before returning `PROVIDER_ERROR`. Zero candidates →
  `failed`/`ADDRESS_NOT_FOUND`; 2+ candidates → `low_confidence`/`ADDRESS_AMBIGUOUS` with null
  coordinates and every candidate stored (never auto-picked); exactly one candidate is scored into
  a 0-1 confidence and compared against `GEOCODE_CONFIDENCE_THRESHOLD` (default 0.7) with an
  **inclusive** `>=` boundary. `normalizeAddressKey` is the §17 cache key. Missing
  `SMARTY_AUTH_ID`/`SMARTY_AUTH_TOKEN` throws an `AppError` naming the missing variable.
- **`api/src/services/geocoding.test.ts`** — 10 tests, `globalThis.fetch` stubbed via `vi.spyOn`,
  covering every behavior in the plan including the exact-threshold-boundary case and the
  malformed-payload → `PROVIDER_ERROR` (never a numeric coordinate) case.
- **`api/src/routes/admin/poiTypes.ts`** — `POST`/`GET /v1/admin/poi-types`, 409
  `POI_TYPE_SLUG_TAKEN` on a duplicate slug.
- **`api/src/routes/admin/pois.ts`** (ADMINPOI-01) — `POST /v1/admin/pois` geocodes the address
  before insert and maps `GeocodeResult` straight onto the `pois` row: nulls stay null, never a
  fabricated coordinate. `status` is `flagged` for anything other than an `ok` geocode, `active`
  otherwise — UC-12 step 5's "saved but flagged, never rejected" contract. Replies 201 with
  `geocodeErrorCode` so the browser can render the right inline copy. `GET /v1/admin/pois` supports
  `poiTypeId`/`status` filters. Also enforces T-01-14 (see Deviations).
- **`api/src/routes/admin/pois.test.ts`** — 9 tests: clean match → `ok`/`active` with numeric
  coordinates; zero candidates → `failed`/`flagged` with null coordinates (asserted via `testDb`,
  not the HTTP response); multi-candidate → `low_confidence` with a populated
  `geocode_candidates` array; below-threshold single match → `low_confidence`/`flagged`; unknown
  `poiTypeId` → 404; missing `addressState` → 400; a 5,000-character `additionalInfo` round-trips
  byte-identical; list ordering; and an auth-boundary test proving both new routes are mounted
  only inside `registerAdminRoutes`.
- **`api/src/routes/admin/index.ts`** — registers `registerPoiTypeRoutes` and `registerPoiRoutes`
  inside the authenticated admin plugin scope.
- **`admin/components/GeocodeStatusBadge.tsx`** (D-02) — maps `ok`/`low_confidence`/`failed`/
  `pending` to "Geocoded"/"Low confidence"/"Failed"/"Pending" in green-600/amber-600/red-600/
  zinc-500, deliberately outside the 60/30/10 accent budget.
- **`admin/app/packs/pois/page.tsx`** — loads the pack to learn its `poiTypeId`, then lists its
  POIs in a table (Name/Address/Geocode status/Updated); Name and Address cells truncate with an
  ellipsis and carry the full value in a native `title` attribute; renders the "No POIs yet" /
  "Add your first POI to start building this pack." empty state with an "Add POI" CTA when the
  list is empty; a `Skeleton` covers the loading state.
- **`admin/app/packs/pois/new/page.tsx`** — Add POI form: fixed address block (name, street, city,
  state, ZIP, optional phone/website) plus a `Textarea` for `additional_info` with no `maxLength`,
  then a "Pack-specific details" section rendering one control per field definition (`Input` for
  text, number-`Input` for number, `Switch` for boolean, url-`Input` for url, tel-`Input` for
  phone, `Select` over `enumOptions` for enum) and one per filter definition (`Checkbox` for
  boolean, `Select` for single-select, a checkbox group for multi-select), built dynamically from
  the pack's own field/filter definitions with `isRequired` fields becoming required in a
  dynamically-assembled Zod schema. On success, a `geocodeErrorCode` of `ADDRESS_NOT_FOUND` /
  `LOW_CONFIDENCE_MATCH` / `ADDRESS_AMBIGUOUS` renders the exact inline copy from the Copywriting
  Contract; otherwise a sonner success toast fires and the browser routes back to the POI list.
- **`admin/app/packs/detail/page.tsx`** — adds a "POIs" link to `/packs/pois?packId=<id>`.
- **`admin/app/packs/page.tsx`** — adds a POI-type `Select` (fed by `poiTypeApi.list()`) with an
  inline "+ create a new POI type" affordance to the pack create form, so a standard pack can be
  given its `poiTypeId` at creation time.
- **`admin/lib/api.ts`** — adds `poiApi` (`list`, `create`) and `poiTypeApi` (`list`, `create`)
  plus the `Poi`/`PoiType`/`CreatePoiInput`/`CreatePoiTypeInput`/`CreatePoiResponse` types.
- **`admin/components/ui/{badge,textarea,switch}.tsx`** — added via
  `npx shadcn@latest add badge textarea switch` (same CLI already verified in 01-01's
  package-legitimacy checkpoint — no new registry or package introduced).

## Verification

- `npm --prefix api test -- geocoding` — 10/10 passing.
- `npm --prefix api test -- pois` — 9/9 passing.
- `npm --prefix api test` — **5 test files, 49 tests, all passing** (adds this plan's 19 new cases
  to 01-01/01-02's 30).
- `npm --prefix api run typecheck` — clean.
- `npm --prefix admin run build` — clean; `admin/out/` includes `packs/pois.html` and
  `packs/pois/new.html` alongside the pre-existing routes, no bracketed dynamic-segment
  directories.
- `npm --prefix admin run typecheck` — clean.
- `! grep -rq 'SMARTY' admin/app admin/lib admin/components` — clean (exit 0): no geocoding
  provider credential name reaches the admin client bundle.
- A live browser walkthrough of the plan's `<human-check>` (empty state, "Add POI" opens the form,
  one control per field/filter type, a real address saving with a green "Geocoded" badge, a bad
  address saving with a red "Failed" badge and the inline error copy, long-name truncation) was
  **not** performed — no browser tool is available in this execution environment, and per this
  plan's own `<note_on_credentials>` there are no real Smarty credentials available here either.
  `human_verify_mode` is `end-of-phase` and auto-chain mode is active, matching 01-01/01-02's own
  precedent for this same gap; a human should confirm this plan's `<human-check>` steps — **with
  real `SMARTY_AUTH_ID`/`SMARTY_AUTH_TOKEN` set in `api/.env` first** (see "Action needed before
  live use" below) — before shipping this phase.

## Action needed before live use

Per this plan's `user_setup` and `<note_on_credentials>`: the geocoding adapter is fully
implemented and unit-tested against a mocked Smarty response, but no real Smarty credentials were
available in this environment. Before any POI can be geocoded against the live Smarty API:

1. Get `SMARTY_AUTH_ID` / `SMARTY_AUTH_TOKEN` from Smarty Dashboard → API Keys → Secret Keys
   (server-to-server key pair, not the website key).
2. Confirm the account's plan permits permanent storage of results (Smarty Dashboard →
   Subscriptions) — this is what §17 relies on to justify the provider choice.
3. Add both values to `api/.env` (not `.env.example` — that file only carries the placeholder
   keys, already updated by this plan with `GEOCODE_CONFIDENCE_THRESHOLD=0.7`).

This is not a blocker for this plan's own completion — every automated `<verify>` step passes
against a mocked provider, exactly as instructed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `scoreCandidate`'s `dpv_match_code === 'N'` case was shadowed by the
ZIP-centroid-precision check**
- **Found during:** Task 1, first `npm --prefix api test -- geocoding` run
- **Issue:** The scoring function checked ZIP-centroid precision (`Zip5`) before checking for an
  explicit `N` (no match) code, so a synthetic `N` + `Zip5` candidate scored 0.3 instead of 0.0 —
  failing the plan's own acceptance criterion that a `dpv_match_code` of `N` scores 0.0 and returns
  `ADDRESS_NOT_FOUND`.
- **Fix:** Reordered the checks so `dpv_match_code === 'N'` returns 0.0 immediately, before any
  precision-based bucketing is consulted.
- **Files modified:** `api/src/services/geocoding.ts`
- **Commit:** `4f96b83`

**2. [Rule 2 - Missing critical functionality] T-01-14's field/filter-key mitigation was not in
the plan's own Task 2 `<action>` text**
- **Found during:** Task 2, reading the plan's threat model before starting the task (per the
  executor's threat-model-reference instruction)
- **Issue:** The threat register assigns `pois.ts` a `mitigate` disposition for "rejects any
  submitted key that does not match a saved field or filter definition for the pack," but the
  task's own `<action>` prose never describes this check — only the upstream fieldKey/filterKey
  regex from plan 01-02 is mentioned.
- **Fix:** Added `findAllowedKeys(poiTypeId)` to `pois.ts`, which looks up every pack built on the
  POI's `poi_type_id` and collects its saved field/filter keys; `POST /v1/admin/pois` now returns
  400 `UNKNOWN_FIELD_OR_FILTER_KEY` for any submitted `customFields`/`filterValues` key outside
  that set.
- **Files modified:** `api/src/routes/admin/pois.ts`
- **Commit:** `802270a`

**3. [Rule 3 - Blocking issue] `node_modules` did not exist yet in either `api/` or `admin/` in
this worktree**
- **Found during:** Task 1's first `npm --prefix api test` attempt (`vitest: command not found`)
- **Issue:** This is a freshly-created worktree; neither package's dependencies had been
  materialized yet, so no test runner, no TypeScript compiler, and (for `admin/`) not even `react`
  itself were resolvable.
- **Fix:** Ran `npm ci` in both `api/` and `admin/` from their existing lockfiles — no new package
  was added or changed, only what `package-lock.json` already declares. This is materializing
  already-locked dependencies, not the new-package-install action the executor's Rule 3 exclusion
  is scoped to.
- **Files modified:** none tracked (`node_modules/` is gitignored in both packages)

None of these three reached Rule 4 (architectural change): the scoring-order fix corrects an
internal bug against the plan's own stated acceptance criterion, the T-01-14 addition applies an
already-authored threat-model mitigation the task text merely omitted restating, and the `npm ci`
runs are environment setup, not new dependencies.

## Known Stubs

None — every endpoint (`poiTypes.ts`, `pois.ts`) and every UI surface (POI list, Add POI form, the
POIs link, the pack-create POI-type selector) is wired to a real Postgres round trip through the
same route/`testDb` pattern established in 01-01/01-02; nothing renders hardcoded/mock data. The
one genuinely deferred piece — the POI edit screen and its ambiguous-geocode candidate picker
dialog — is explicitly out of this plan's scope per its own action text ("that screen lands in
plan 01-04"), not a stub.

## Threat Flags

None beyond what `01-03-PLAN.md`'s own `<threat_model>` already covers (T-01-05, T-01-06, T-01-03,
T-01-07, T-01-14, T-01-15, T-01-SC) — `registerPoiTypeRoutes`/`registerPoiRoutes` are mounted only
inside `registerAdminRoutes` (consistent with T-01-01 from 01-01/01-02), the Smarty response is
Zod-parsed before any value is read (T-01-06), `AbortSignal.timeout(5000)` plus the capped 2-retry
backoff bounds every call (T-01-07), and T-01-14's key-validation gap (see Deviations #2) is now
closed rather than left as a flag.

## Self-Check: PASSED

All 14 files listed under `key-files` verified present on disk via `[ -f "$f" ]`.

Commit hashes verified present in `git log --oneline`:
- `4f96b83` feat(01-03): Smarty geocoding adapter and §15 error taxonomy
- `802270a` feat(01-03): POI types and the geocode-on-save POI create endpoint (ADMINPOI-01)
- `6499778` feat(01-03): POI list and Add POI screens with geocode status badges

`git status --short` confirms a clean working tree — all task files committed, no stray untracked
or unstaged changes (beyond this SUMMARY.md, added next).
