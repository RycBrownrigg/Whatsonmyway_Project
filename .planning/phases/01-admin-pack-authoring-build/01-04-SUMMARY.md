---
phase: 01-admin-pack-authoring-build
plan: 04
subsystem: admin-poi-review-correction
tags: [admin, api, fastify, drizzle, zod, geocoding, react-hook-form, shadcn, vitest, dialog]
dependency-graph:
  requires:
    - api/src/db/client.ts (db)
    - api/src/db/schema.ts (pois — status/geocode_status/geocode_candidates)
    - api/src/services/geocoding.ts (geocodeAddress, normalizeAddressKey — 01-03)
    - api/src/routes/admin/pois.ts (CreatePoiSchema, findAllowedKeys, registerPoiRoutes — 01-03)
    - api/test/setup.ts (testDb, resetDb, buildTestApp, ADMIN_TOKEN_FOR_TESTS)
    - admin/lib/api.ts (apiCall, packApi, poiApi — 01-01/01-03 base)
    - admin/app/packs/pois/new/page.tsx (the pre-01-04 Add POI form this plan factors into a shared control set)
    - admin/components/GeocodeStatusBadge.tsx (01-03)
  provides:
    - api/src/routes/admin/pois.ts (UpdatePoiSchema, GeocodeActionSchema, GET/PUT /v1/admin/pois/:id, POST /v1/admin/pois/:id/geocode)
    - api/src/services/geocoding.ts (clearGeocodeMemo, geocodeAddress's bypassMemo option)
    - admin/lib/poiForm.ts (POI_FIXED_SCHEMA, buildPoiDynamicSchema, poiErrorCopy, PoiFormValues)
    - admin/components/PoiFormFields.tsx (PoiFixedFields, PoiDynamicFields)
    - admin/components/GeocodeCandidateDialog.tsx (GeocodeCandidateDialog)
    - admin/app/packs/pois/edit/page.tsx (POI edit screen)
    - admin/lib/api.ts (poiApi.get/update/retryGeocode/selectCandidate, GeocodeCandidate, UpdatePoiInput)
  affects:
    - admin/app/packs/pois/new/page.tsx (rewritten to import the shared PoiFixedFields/PoiDynamicFields/poiErrorCopy rather than its own copies)
tech-stack:
  added:
    - "shadcn Dialog primitive (admin/components/ui/dialog.tsx) — same registry/CLI already legitimacy-verified in 01-01, no new package"
  patterns:
    - "Route-level address-key short-circuit (§17) — PUT compares normalizeAddressKey of the merged patch against the stored address and skips the provider entirely when equal, carrying every geocode column and status through unchanged; this is what stops an unrelated name/phone/website/custom-field edit from silently un-flagging a POI"
    - "Explicit-retry bypasses the memo, never the reverse — geocodeAddress gained a short-lived in-process memo (15 min, keyed by normalizeAddressKey) to collapse duplicate calls within a session, but POST /geocode's no-body retry path calls it with { bypassMemo: true } so an explicit admin action always reaches the provider even when a fresh memo entry exists for that address"
    - "Provider errors are never memoized — only a settled geocode outcome (ok/low_confidence/failed with a real errorCode) is cached; PROVIDER_ERROR is transient and must not block a legitimate retry inside the memo's window"
    - "One control set, two screens — admin/lib/poiForm.ts + admin/components/PoiFormFields.tsx factor the fixed address block, dynamic pack-field/filter rendering, and inline error copy out of the Add POI form so the edit screen renders the identical markup rather than a forked copy"
key-files:
  created:
    - admin/lib/poiForm.ts
    - admin/components/PoiFormFields.tsx
    - admin/app/packs/pois/edit/page.tsx
    - admin/components/GeocodeCandidateDialog.tsx
    - admin/components/ui/dialog.tsx
  modified:
    - api/src/routes/admin/pois.ts
    - api/src/routes/admin/pois.test.ts
    - api/src/services/geocoding.ts
    - api/src/services/geocoding.test.ts
    - admin/lib/api.ts
    - admin/app/packs/pois/new/page.tsx
decisions:
  - "geocodeAddress gained a bypassMemo option not spelled out in the plan's own <action> text, because a literal reading of 'consulted at the top of geocodeAddress' would let the memo silently satisfy an explicit POST /geocode retry from cache — directly contradicting the plan's own required behavior ('POST /geocode with no body always issues a provider call, even when the address is unchanged') and its own acceptance criterion asserting the fetch stub is called exactly once. Applied as a Rule 1 fix against the plan's own stated behavior, not an architectural change: the memo is still exactly what the plan describes for every other call site (create, PUT-with-changed-address), just not for the one path the plan itself calls out as deliberately bypassing the equivalent PUT short-circuit."
  - "PROVIDER_ERROR results are excluded from the memo (only ok/low_confidence/failed outcomes are cached) — a transient provider failure is not a stable fact about the address, and caching it would silently block a legitimate retry for up to 15 minutes. Not stated in the plan's action text; added because the memo's own stated purpose ('collapse duplicate calls for the same address') doesn't apply to a failed attempt at making the call."
  - "Added GET /v1/admin/pois/:id, which the plan's own action text requires implicitly ('admin/lib/api.ts's poiApi with get(id)...') but never explicitly mounts. Without it there is no way for the edit screen to load a single POI by id. Rule 2 (missing critical functionality the edit form cannot work without)."
  - "Applied the same T-01-14 (01-03 threat register) customFields/filterValues key allowlist check to PUT that 01-03 applied to POST, even though this plan's own threat register doesn't re-list T-01-14 for this file. The same JSONB-key tampering surface exists on the update path as on create; leaving it unguarded on PUT while guarding POST would be an inconsistent, easily-missed gap in the same file."
  - "The candidate picker uses plain native radio inputs rather than adding a shadcn RadioGroup component — the plan's own flagged_assumptions records the simple radio-select list as an unresolved-wireframe assumption, and a native radio input satisfies that exact requirement (one selectable row per candidate, nothing pre-selected, disabled confirm until a selection is made) without a second new-component install beyond the Dialog itself."
metrics:
  duration: "~55 minutes"
  completed: "2026-09-21"
status: complete
actuals:
  tokens: 16900
  tasks: 2
  commits: 2
---

# Phase 1 Plan 4: Admin POI Review & Correction Loop Summary

Closed the geocoding review loop plan 01-03 opened: a flagged POI is now correctable from its own
edit screen — address fixes re-geocode and can flip it back to `active`, an explicit "Retry
Geocode" always reaches the provider even when nothing changed, and an ambiguous address is
resolved by a human picking from the stored candidates in a picker dialog, never by the system
guessing.

## What Was Built

- **`api/src/routes/admin/pois.ts`** (ADMINPOI-02) — `UpdatePoiSchema` (every `CreatePoiSchema`
  field optional, `poiTypeId` omitted entirely so a POI can't be silently moved between pack
  types), `GeocodeActionSchema` (an optional `{ selectedCandidateIndex }` body). Three new routes:
  - `GET /v1/admin/pois/:id` — 404 `POI_NOT_FOUND` when absent (added per Deviations below).
  - `PUT /v1/admin/pois/:id` — merges the patch over the stored row, compares
    `normalizeAddressKey` of the merged address against the stored address, and when equal skips
    the geocoding provider entirely, carrying every `geocode_*` column and `status` through
    unchanged — the §17 "don't re-bill" control and the T-01-17 "never quietly un-flag" control in
    one comparison. When the address changed, calls `geocodeAddress` once and maps the result
    exactly as the create path does. Also re-applies T-01-14's field/filter-key allowlist to any
    submitted `customFields`/`filterValues` (see Deviations).
  - `POST /v1/admin/pois/:id/geocode` — with no body, always calls the provider (with
    `bypassMemo: true`, see Deviations) even when the address is unchanged, because this is an
    explicit admin action, not a save. With `{ selectedCandidateIndex }`, reads the stored
    `geocode_candidates`, 409 `NO_CANDIDATES_STORED` when empty/null, 400
    `CANDIDATE_INDEX_OUT_OF_RANGE` when unaddressable, otherwise re-parses the candidate's
    latitude/longitude as finite numbers (T-01-16) and writes them with `geocode_status: 'ok'`,
    `geocode_confidence: 1.0`, `status: 'active'`, clearing `geocode_candidates` — no provider call
    on this path.
- **`api/src/services/geocoding.ts`** — a module-level `Map` memo keyed by `normalizeAddressKey`,
  consulted at the top of `geocodeAddress` and served when under 15 minutes old, collapsing
  duplicate provider calls within one admin session. `geocodeAddress` gained a `{ bypassMemo }`
  option so the explicit retry path always reaches the provider (see Deviations).
  `clearGeocodeMemo()` exported for tests. `PROVIDER_ERROR` results are never memoized (see
  Deviations).
- **`api/src/routes/admin/pois.test.ts`** — 12 new tests covering every `<behavior>` line: changed
  address issues exactly one provider call and rewrites the geocode columns; unchanged address
  issues zero calls and preserves `status`/geocode columns even when name/phone/website/custom
  fields change; a name-only edit on a flagged POI leaves it flagged; a corrected address flips to
  `ok`/`active`; a still-broken address stays `failed`/`flagged`; `POST /geocode` with no body
  always calls the stub exactly once even unchanged; a resolved retry clears
  `geocode_candidates`; an unknown id returns 404; `selectedCandidateIndex` writes the exact
  chosen coordinates and makes zero provider calls; an out-of-range index returns 400 and leaves
  the row untouched; no-stored-candidates returns 409; a ten-candidate list resolves its last
  index correctly.
- **`admin/lib/poiForm.ts`** — the shared `POI_FIXED_SCHEMA`, `buildPoiDynamicSchema`, and
  `poiErrorCopy` (Copywriting Contract inline error text) factored out so both POI screens use one
  schema/copy source.
- **`admin/components/PoiFormFields.tsx`** — `PoiFixedFields` (name/address/phone/website/notes)
  and `PoiDynamicFields` (the "Pack-specific details" field/filter grid), the shared control set
  the plan requires; `admin/app/packs/pois/new/page.tsx` was rewritten to import these instead of
  carrying its own copy.
- **`admin/app/packs/pois/edit/page.tsx`** — loads the POI via `poiApi.get` and the pack via
  `packApi.get` inside a `<Suspense>` boundary, pre-fills every control (via react-hook-form's
  `values` prop, which re-syncs the form the moment the query resolves) including pack-specific
  custom fields and filter values. Primary Button reads exactly "Save Changes"; a secondary Button
  reads exactly "Retry Geocode" and calls `poiApi.retryGeocode`. Shows `GeocodeStatusBadge` plus
  the confidence score when present. Renders the same inline destructive copy as the create form
  for `ADDRESS_NOT_FOUND`/`LOW_CONFIDENCE_MATCH`. When `geocodeCandidates` is non-empty, renders a
  "Choose the correct address" banner/button that opens `GeocodeCandidateDialog`; on resolution,
  invalidates the POI query so the badge and banner both re-derive from a fresh GET.
- **`admin/components/GeocodeCandidateDialog.tsx`** — a `'use client'` shadcn Dialog with the exact
  `ADDRESS_AMBIGUOUS` Copywriting Contract title, a radio-select list (one line per candidate
  address, native radio inputs, nothing pre-selected) that scrolls inside the dialog body rather
  than growing past the viewport, and a confirm Button disabled until a row is picked. Confirming
  calls `poiApi.selectCandidate(id, index)` then `onResolved`.
- **`admin/components/ui/dialog.tsx`** — added via `npx shadcn@latest add dialog` (same
  registry/CLI already legitimacy-verified in 01-01 — no new registry or package introduced).
- **`admin/lib/api.ts`** — `poiApi.get/update/retryGeocode/selectCandidate`, `UpdatePoiInput`,
  standalone `GeocodeCandidate` type (`Poi.geocodeCandidates` now typed against it).

## Verification

- `npm --prefix api test -- pois` — 21/21 passing.
- `npm --prefix api test` — **5 test files, 61 tests, all passing** (adds this plan's 12 new
  cases to 01-01/01-02/01-03's 49).
- `npm --prefix api run typecheck` — clean.
- `npm --prefix admin run build` — clean; `admin/out/` includes `packs/pois/edit.html` and
  `packs/pois/new.html`.
- `npm --prefix admin run typecheck` — clean.
- `! grep -rq 'SMARTY' admin/app admin/lib admin/components` — clean (exit 1/no match): no
  geocoding provider credential name reaches the admin client bundle.
- A live browser walkthrough of both `<human-check>` blocks (correcting a failed address to
  "Geocoded", confirming a re-save without an address change stays "Geocoded", "Retry Geocode" on
  a still-broken address, the ambiguous-candidate picker with 2 and with many candidates) was
  **not** performed — no browser tool is available in this execution environment, and per this
  plan's `<note_on_credentials>` there are no real Smarty credentials available here either.
  `human_verify_mode` is `end-of-phase` and auto-chain mode is active, matching 01-03's own
  precedent for this same gap; a human should confirm both `<human-check>` blocks — **with real
  `SMARTY_AUTH_ID`/`SMARTY_AUTH_TOKEN` set in `api/.env` first**, per 01-03-SUMMARY.md's "Action
  needed before live use" — before shipping this phase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The memo would have silently satisfied an explicit "Retry Geocode" from cache**
- **Found during:** Task 1, while implementing the memo per the plan's `<action>` text
- **Issue:** The plan's `<action>` describes the memo as "consulted at the top of `geocodeAddress`"
  unconditionally. Taken literally, a POI created moments earlier (which populates the memo for its
  address) followed by an explicit `POST /geocode` retry for that same still-unchanged address
  would be served from the memo — zero additional `fetch` calls — directly contradicting the same
  plan's own required behavior ("POST /geocode with no body always issues a provider call, even
  when the address is unchanged, because it is an explicit admin retry") and its own acceptance
  criterion asserting the fetch stub is called exactly once on that path.
- **Fix:** `geocodeAddress` takes an optional `{ bypassMemo }` parameter; the `POST /geocode`
  no-body handler passes `bypassMemo: true`. Every other call site (create, PUT-with-changed-address)
  still consults the memo as the plan describes.
- **Files modified:** `api/src/services/geocoding.ts`, `api/src/routes/admin/pois.ts`
- **Commit:** `9251ad1`

**2. [Rule 1 - Bug] `PROVIDER_ERROR` results were about to be cached by the memo**
- **Found during:** Task 1, same implementation pass
- **Issue:** A naive "cache whatever `geocodeAddress` returns" memo would also cache a transient
  `PROVIDER_ERROR` (retries-exhausted) outcome, which is a fact about that one call attempt, not a
  stable fact about the address — caching it would block a legitimate retry for up to 15 minutes.
- **Fix:** The memo is only written when `result.errorCode !== 'PROVIDER_ERROR'`.
- **Files modified:** `api/src/services/geocoding.ts`
- **Commit:** `9251ad1`

**3. [Rule 2 - Missing critical functionality] No route to load a single POI by id**
- **Found during:** Task 1, while wiring `admin/lib/api.ts`'s `poiApi.get(id)` per the plan's own
  action text
- **Issue:** The plan's mount list for this task names only `PUT /v1/admin/pois/:id` and
  `POST /v1/admin/pois/:id/geocode`, but its own action text requires `poiApi.get(id)` to load the
  edit screen's POI, and no `GET /v1/admin/pois/:id` route existed (only the list endpoint).
  Without it the edit screen cannot load.
- **Fix:** Added `GET /v1/admin/pois/:id`, 404 `POI_NOT_FOUND` when absent, following the existing
  route conventions in this file.
- **Files modified:** `api/src/routes/admin/pois.ts`
- **Commit:** `9251ad1`

**4. [Rule 2 - Missing critical functionality] PUT didn't re-apply T-01-14's field/filter-key allowlist**
- **Found during:** Task 1, reading 01-03's threat register (T-01-14) before starting the task
- **Issue:** 01-03's threat model requires that any submitted `customFields`/`filterValues` key
  must match a saved field/filter definition for the POI's type — implemented on `POST` in 01-03,
  but the same JSONB-key surface exists on `PUT`, and this plan's own action text doesn't mention
  re-applying it there.
- **Fix:** `PUT` now runs the same `findAllowedKeys` check as `POST` when the patch includes
  `customFields`/`filterValues`, returning 400 `UNKNOWN_FIELD_OR_FILTER_KEY` on a mismatch.
- **Files modified:** `api/src/routes/admin/pois.ts`
- **Commit:** `9251ad1`

None of these four reached Rule 4 (architectural change): the memo-bypass and no-cache-on-error
fixes correct a literal-reading bug against the plan's own stated acceptance criteria for the same
feature, the `GET /:id` addition materializes a route the plan's own action text already implies,
and the T-01-14 re-application extends an existing, already-authored control from a sibling route
in the same file rather than inventing a new one.

## Known Stubs

None — every new route (`GET/PUT /v1/admin/pois/:id`, `POST /v1/admin/pois/:id/geocode`) round-trips
through the same `testDb`/route pattern established in 01-01/01-03, and every new UI surface (the
edit screen, the candidate dialog) is wired to real `poiApi` calls; nothing renders hardcoded or
mock data.

## Threat Flags

None beyond what `01-04-PLAN.md`'s own `<threat_model>` already covers (T-01-16, T-01-17, T-01-03,
T-01-07, T-01-01, T-01-18) — `selectedCandidateIndex` is bounds-checked and its coordinates
re-parsed as finite numbers before being written (T-01-16), `UpdatePoiSchema` excludes `poiTypeId`
and every server-derived `status`/`geocode_*` column (T-01-17), the new routes are Drizzle-only
with Zod-parsed input before any query (T-01-03), the geocode memo is bounded to 15 minutes and
keyed by a normalized address (T-01-07), both new mutating routes mount only inside
`registerPoiRoutes`/`registerAdminRoutes` (T-01-01), and there is still no per-admin attribution
for who accepted a candidate (T-01-18, accepted — single shared credential per D-01).

## Self-Check: PASSED

All 11 `key-files` entries verified present on disk via `[ -f "$f" ]` (5 created, 6 modified).

Commit hashes verified present in `git log --oneline`:
- `9251ad1` feat(01-04): PUT/POST geocode routes and POI edit screen for the review loop (ADMINPOI-02)
- `5531866` feat(01-04): ambiguous-candidate picker dialog — admin chooses, never the system

`git status --short` confirms a clean working tree — all task files committed, no stray untracked
or unstaged changes (beyond this SUMMARY.md, added next).
