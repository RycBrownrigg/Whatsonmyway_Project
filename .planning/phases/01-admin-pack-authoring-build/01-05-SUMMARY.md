---
phase: 01-admin-pack-authoring-build
plan: 05
subsystem: admin-pack-build
tags: [admin, api, fastify, drizzle, zod, vitest, tdd, gzip, sha256]
dependency-graph:
  requires:
    - api/src/db/client.ts (db)
    - api/src/db/schema.ts (packs, packFieldDefinitions, packFilterDefinitions, pois, packPois, packVersions, poiTypes — all pre-existing, no schema change)
    - api/src/utils/errors.ts (AppError)
    - api/src/routes/admin/index.ts (registerAdminRoutes)
    - api/test/setup.ts (testDb, resetDb, buildTestApp, ADMIN_TOKEN_FOR_TESTS)
    - admin/lib/api.ts (apiCall, ApiError, packApi — 01-01 base)
    - admin/app/packs/detail/page.tsx (the Fields/Filters card layout this plan appends to)
  provides:
    - api/src/services/packBuild.ts (buildStandardPack, validateRequiredFields, PackBuildResult, MissingFieldReport)
    - api/src/routes/admin/build.ts (registerBuildRoutes — POST /v1/admin/packs/:id/build)
    - admin/components/PackBuildPanel.tsx (PackBuildPanel)
    - admin/lib/api.ts (packApi.build, PackBuildResult, MissingFieldReportEntry, ApiError.report)
    - api/src/utils/errors.ts (AppError.details — optional structured payload)
  affects:
    - api/src/routes/admin/index.ts (registers registerBuildRoutes)
    - admin/app/packs/detail/page.tsx (renders PackBuildPanel below Filters/Save Pack Framework)
tech-stack:
  added: []
  patterns:
    - "Pack file format decision (checkpoint:decision, Task 1) — gzipped JSON (Option A): format_version 1, pack/field_defs/filter_defs/pois blocks matching Product Specification.md §5's on-device shape, gzipped with node:zlib (no new dependency), sha256-checksummed. This is the byte format Phase 2 downloads and Phase 5 version-guards — a one-way door per pack_versions.format_version's own purpose."
    - "TDD RED/GREEN via a temporary stub, not a partial feature — packBuild.ts, build.ts, and index.ts's registration were written in full first (this is genuinely new code, not an extension of an existing file), then packBuild.ts was swapped for a stub (validateRequiredFields returns [], buildStandardPack throws) to produce a real RED commit (17/18 cases failing), then restored for the GREEN commit (18/18 passing) — the same test(...)-before-feat(...) gate sequence the codebase's prior TDD plans establish, applied to a brand-new module rather than an existing one."
    - "AppError.details — an optional structured payload (undefined for every pre-existing throw site) so a service can carry data richer than a message string out to its route layer without inventing a parallel error shape; packBuild.ts uses it to carry MissingFieldReport[] for MISSING_REQUIRED_FIELDS."
    - "Reproducibility proven by deleting the pack_versions row and rebuilding identical data rather than by disabling the version increment — isolates the 'same input -> same checksum' property from the (deliberately incrementing) version number embedded in the file, without touching the build's real versioning behavior."
    - "Client-side build-failure copy is hardcoded by error code (PackBuildPanel), matching the codebase's existing convention (lib/poiForm.ts's poiErrorCopy) of keying user-facing text off the API's error *code*, not its message string."
key-files:
  created:
    - api/src/services/packBuild.ts
    - api/src/services/packBuild.test.ts
    - api/src/routes/admin/build.ts
    - admin/components/PackBuildPanel.tsx
    - api/.gitignore
  modified:
    - api/src/routes/admin/index.ts
    - api/src/utils/errors.ts
    - api/.env.example
    - admin/lib/api.ts
    - admin/app/packs/detail/page.tsx
decisions:
  - "Task 1 checkpoint:decision — Option A (gzipped JSON) selected by the user over B (pre-built SQLite, would need a new better-sqlite3 dependency and a fresh legitimacy check) and C (uncompressed JSON, no benefit given spec §3's resumable-range download design). Recorded per the plan's own acceptance criteria: a human selected exactly one option."
  - "AppError gained an optional 4th constructor param (`details`) rather than a parallel MissingFieldError class, so every existing AppError throw site (geocoding.ts, pois.ts, packs.ts, etc.) is unaffected and packBuild.ts's route layer can read `err.details` generically."
  - "api/.gitignore's `packfiles` entry has no trailing slash, unlike a typical directory-only gitignore pattern — `git check-ignore -q api/packfiles` (the plan's own verify command) returns non-zero when the directory doesn't exist yet, which is exactly the state of a fresh checkout before any pack has ever been built. A trailing-slash pattern can't be verified pre-existence; the no-slash form matches a file-or-directory named `packfiles` regardless of whether it currently exists on disk, so the plan's own verify step passes in CI/fresh-clone as well as after a real build. Rule 1 (bug) fix against the plan's own literal action text."
  - "The build-failure banner's two D-04 states share one BuildFailureBanner component (heading + optional body + optional report table) rather than two separate components, since PACK_HAS_NO_ELIGIBLE_POIS is a single-line message with no table and MISSING_REQUIRED_FIELDS is heading+body+table — same visual container (red-600 border), different content."
metrics:
  duration: "~70 minutes"
  completed: "2026-09-21"
status: complete
actuals:
  tokens: 9500
  tasks: 3
  commits: 3
---

# Phase 1 Plan 5: Pack Build Summary

Closed ADMINBUILD-01, the phase's terminal capability: an admin can now turn a populated pack into
a checksummed, versioned, downloadable pack file — every active, ok-geocoded POI of the pack's
type, in a build that refuses to proceed (naming every offending POI and field) when required
framework data is missing anywhere in the set, and never publishes itself.

## What Was Built

- **Task 1 (checkpoint:decision) — pack file format.** Presented three options for the on-disk
  format Phase 2 downloads and Phase 5 version-guards. The user selected **Option A: gzipped
  JSON** — no new server dependency (`node:zlib` is built in), keeps on-device schema ownership
  with the client (what Phase 5's migration story needs), and is human-diffable when
  decompressed for debugging a bad build.
- **`api/src/services/packBuild.ts`** (ADMINBUILD-01) — `validateRequiredFields(fields, pois)`, a
  pure function returning a `MissingFieldReport[]` (one entry per offending POI, every missing
  key listed, no cap/slice/early-exit). `buildStandardPack(packId)` implements UC-14: loads the
  pack (404 `PACK_NOT_FOUND`; 400 `STATE_PACK_BUILD_NOT_SUPPORTED` for a state pack — UC-15 is
  Phase 4; 400 `PACK_HAS_NO_POI_TYPE`), selects eligible POIs (`poiTypeId` match, `geocodeStatus:
  'ok'`, `status: 'active'`, ordered by `pois.id` for reproducible/diffable builds only — no
  app-facing ordering meaning, since the client filters by bounding box plus haversine), 400
  `PACK_HAS_NO_ELIGIBLE_POIS` with the exact required copy when that set is empty, then runs
  `validateRequiredFields` and throws 422 `MISSING_REQUIRED_FIELDS` (carrying the full report via
  `AppError.details`) writing nothing when it's non-empty. A successful build serializes the
  checkpoint-A document (`format_version: 1`, `pack`/`field_defs`/`filter_defs`/`pois` blocks
  matching Product Specification.md §5's on-device shape), gzips it with `node:zlib`, sha256
  checksums the gzipped bytes, writes it to `PACK_FILE_DIR/{slug}/v{n}.json.gz` (path resolved and
  asserted inside `PACK_FILE_DIR` before writing — T-01-19), and in one Drizzle transaction
  rewrites the `pack_pois` snapshot, inserts the `pack_versions` row, and bumps
  `packs.currentVersion` — `packs.status` is never touched (UC-14 step 6: publishing is a separate
  admin act).
- **`api/src/routes/admin/build.ts`** — `registerBuildRoutes(fastify)` mounts
  `POST /v1/admin/packs/:id/build` as a thin wrapper: calls `buildStandardPack`, replies 201 with
  the `PackBuildResult`, and maps a thrown `AppError` to `{ error, message, report? }` (`report`
  present only for `MISSING_REQUIRED_FIELDS`). Registered in
  `api/src/routes/admin/index.ts` inside the same authenticated scope as every other admin route
  module (T-01-01).
- **`api/src/services/packBuild.test.ts`** — 18 cases: three pure `validateRequiredFields` unit
  tests, then `buildStandardPack` cases covering every `<behavior>` line (eligible-set size,
  geocode/status exclusion, cross-type exclusion, TC-27's full-report failure and its "leaves the
  previous version/snapshot untouched" corollary, the three-different-missing-fields
  no-truncation case, the zero-eligible-POI exact message, TC-28's version-2 rebuild, id-ascending
  file ordering plus reproducible checksums, `packs.status` untouched, state-pack rejection,
  unknown-pack 404), plus three `app.inject`-based route-wrapper tests proving the real HTTP status
  codes (201/422/400) and the report/no-report shape.
- **`api/src/utils/errors.ts`** — `AppError` gained an optional `details` field (Deviations).
- **`api/.env.example`** — `PACK_FILE_DIR=./packfiles` added.
- **`api/.gitignore`** (new file) — `packfiles` (no trailing slash — see Deviations).
- **`admin/lib/api.ts`** — `packApi.build(packId)`; `ApiError` gained an optional `report` field
  threaded from the API's error body; `PackBuildResult` and `MissingFieldReportEntry` types.
- **`admin/components/PackBuildPanel.tsx`** — a `'use client'` Card titled "Build" with the primary
  "Build Pack" Button (disabled + "Building…" + a `lucide-react` `Loader2` spinner while the
  mutation is pending, no separate progress screen). Shows current/latest version, POI count, and
  checksum. On success: the exact toast "Pack built — version {version}, {poi_count} POIs
  included." On `MISSING_REQUIRED_FIELDS`: the D-04 heading/body plus a scrolling POI Name /
  Missing Field(s) table with every report entry (no cap), each name linking to
  `/packs/pois/edit?id=...&packId=...`. On `PACK_HAS_NO_ELIGIBLE_POIS`: the same banner style with
  the exact required copy. Any other error raises a destructive toast carrying the code. A
  following successful build clears the banner (react-query resets the mutation's error state on
  the next call).
- **`admin/app/packs/detail/page.tsx`** — renders `PackBuildPanel` below the Filters
  card/Save-Framework button, at the 2xl (48px) major-section break.

## Verification

- **TDD gate sequence** (Task 2): `test(01-05)` commit (`6078ea9`) precedes its `feat(01-05)`
  commit (`edb572f`) — confirmed in `git log`. Against the RED stub, 17/18 cases failed (one
  vacuously passed — the "no required fields" edge case, which the stub's `[]`-always
  `validateRequiredFields` trivially satisfies; every behaviorally meaningful case failed as
  expected). After restoring the real implementation, 18/18 passed.
- `npm --prefix api test -- packBuild` — 18/18 passing.
- `npm --prefix api test` — **6 test files, 79 tests, all passing.**
- `npm --prefix api run typecheck` — clean.
- `git check-ignore -q api/packfiles` — exits 0 (both before and after the directory exists on
  disk — see Deviations).
- `npm --prefix admin run build` — clean; `admin/out/` regenerated (includes `/packs/detail`).
- `npm --prefix admin run typecheck` — clean.
- TC-27 (missing-field failure + full report) and TC-28 (rebuild picks up a newly-added POI) are
  each covered by a named test, as is "a failed build leaves the previous version/snapshot intact"
  and "`packs.status` is untouched by a successful build."
- A live browser walkthrough of Task 3's `<human-check>` (zero-POI banner, three-missing-field
  table with working edit links, "Building…" state, version-1-then-version-2 success toasts) was
  **not** performed — no browser automation tool is available in this execution environment,
  matching 01-02's and 01-04's own precedent for this same gap. `human_verify_mode` is
  `end-of-phase`; a human should walk this plan's `<human-check>` block, ideally alongside
  01-02's and 01-04's still-unconfirmed walkthroughs, before shipping this phase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `git check-ignore -q api/packfiles` fails on a fresh checkout with a trailing-slash pattern**
- **Found during:** Task 2, running the plan's own `<verify>` command after writing `api/.gitignore`
- **Issue:** A directory-only gitignore pattern (`packfiles/`) requires git to know the path is a
  directory to match it. `git check-ignore -q api/packfiles` on a path that doesn't exist yet
  (exactly the state of a fresh clone, since `PACK_FILE_DIR` is generated output that never enters
  version control) returns a non-zero exit — the plan's own verify command would fail in CI or on
  a fresh checkout, before anyone had ever built a pack.
- **Fix:** Changed the pattern to `packfiles` (no trailing slash), which matches a path named
  `packfiles` whether it's a file or a directory and regardless of whether it currently exists on
  disk. Confirmed `git check-ignore -q api/packfiles` exits 0 both with and without the directory
  present.
- **Files modified:** `api/.gitignore`
- **Commit:** `edb572f`

**2. [Rule 2 - Missing critical functionality] `AppError` had no way to carry structured data**
- **Found during:** Task 2, implementing the 422 `MISSING_REQUIRED_FIELDS` throw
- **Issue:** The plan's own action text requires `buildStandardPack` to "throw `AppError` 422
  `MISSING_REQUIRED_FIELDS` carrying the full report as structured data," and `build.ts`'s action
  text requires the route to reply with `{ error, message, report }`. `AppError` as it existed
  (statusCode, code, message) had no field to carry the report through from service to route.
- **Fix:** Added an optional 4th constructor parameter, `details?: unknown`, defaulting to
  `undefined` — every existing `AppError` throw site across the codebase (geocoding.ts, pois.ts,
  packs.ts, fields.ts, filters.ts) is unaffected since the parameter is optional and unused there.
  `packBuild.ts` passes the `MissingFieldReport[]` as `details`; `build.ts` reads
  `err.details` and includes it as `report` only when `err.code === 'MISSING_REQUIRED_FIELDS'`.
- **Files modified:** `api/src/utils/errors.ts`, `api/src/services/packBuild.ts`,
  `api/src/routes/admin/build.ts`
- **Commit:** `edb572f`

Neither deviation reached Rule 4 (architectural change): the gitignore fix is a one-line pattern
correction that makes the plan's own verify command actually verify what it claims to, and the
`AppError.details` addition is a strictly-additive, optional field that materializes exactly the
data-carrying behavior both this task's and Task 3's own action text already require.

## Known Stubs

None — `buildStandardPack` performs a real filesystem write and a real multi-table Drizzle
transaction against Postgres; `PackBuildPanel` is wired to a real `packApi.build` call with no
hardcoded or mock data. The generated pack file itself is real gzipped JSON, not a placeholder.

## Threat Flags

None beyond what `01-05-PLAN.md`'s own `<threat_model>` already covers (T-01-19, T-01-20, T-01-21,
T-01-03, T-01-22, T-01-23, T-01-01) — the pack file path is resolved and asserted inside
`PACK_FILE_DIR` before every write (T-01-19), the snapshot rewrite and version insert run inside
one transaction (T-01-20), eligibility is a server-side predicate with no client-supplied POI list
(T-01-21), the service is Drizzle-query-builder only with no interpolated SQL (T-01-03),
`packfiles/` is gitignored and unserved by any route this phase adds (T-01-22), and
`registerBuildRoutes` is mounted only inside `registerAdminRoutes` (T-01-01).

## Self-Check: PASSED

Verified on disk: `api/src/services/packBuild.ts`, `api/src/services/packBuild.test.ts`,
`api/src/routes/admin/build.ts`, `api/src/routes/admin/index.ts`, `api/.env.example`,
`api/.gitignore`, `api/src/utils/errors.ts`, `admin/lib/api.ts`,
`admin/components/PackBuildPanel.tsx`, `admin/app/packs/detail/page.tsx` — all present.

Commit hashes verified present in `git log --oneline`:
- `6078ea9` test(01-05): add failing coverage for standard pack build (ADMINBUILD-01)
- `edb572f` feat(01-05): implement standard pack build — validate, snapshot, write, checksum, version (ADMINBUILD-01)
- `d3f7aba` feat(01-05): Build Pack panel with the inline D-04 failure report

`git status --short` confirms a clean working tree — all task files committed, no stray untracked
or unstaged changes (beyond this SUMMARY.md, added next, and the two pre-existing
`.planning/milestone.lock` / `.planning/state.json` untracked files that predate this plan).
