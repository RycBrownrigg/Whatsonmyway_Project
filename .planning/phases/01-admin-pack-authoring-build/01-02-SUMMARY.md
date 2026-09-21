---
phase: 01-admin-pack-authoring-build
plan: 02
subsystem: admin-pack-framework-builder
tags: [admin, api, fastify, drizzle, zod, react-hook-form, shadcn, vitest, tdd]
dependency-graph:
  requires:
    - api/src/db/client.ts (db)
    - api/src/middleware/adminAuth.ts (adminAuthPreHandler)
    - api/src/routes/admin/index.ts (registerAdminRoutes)
    - api/src/routes/admin/packs.ts (registerPackRoutes)
    - api/test/setup.ts (testDb, resetDb, buildTestApp, ADMIN_TOKEN_FOR_TESTS)
    - admin/lib/api.ts (apiCall, packApi — 01-01 base)
  provides:
    - api/src/routes/admin/fields.ts (registerFieldRoutes GET/PUT/DELETE, CreateFieldSchema, UpdateFieldSchema)
    - api/src/routes/admin/filters.ts (registerFilterRoutes, CreateFilterSchema, UpdateFilterSchema)
    - admin/components/FrameworkFieldRows.tsx (FrameworkFieldRows, FrameworkFieldRowsHandle, RemoveDefinitionButton)
    - admin/components/FrameworkFilterRows.tsx (FrameworkFilterRows, FrameworkFilterRowsHandle)
    - admin/lib/api.ts (listFields, updateField, removeField, listFilters, addFilter, updateFilter, removeFilter)
  affects:
    - api/src/routes/admin/index.ts (registers registerFilterRoutes)
    - api/src/routes/admin/packs.ts (GET /v1/admin/packs/:id now returns filters)
    - admin/app/packs/detail/page.tsx (renders both cards, page-level Save button)
tech-stack:
  added: []
  patterns:
    - Zod .superRefine() cross-field validation (enumOptions/options required exactly when the discriminating enum value calls for it, forbidden otherwise) — same pattern on both server schemas and their client-side RHF mirrors
    - Repeatable-row framework builder (D-03): one row component per definition type, zero/one/many rows all render through the same component; saved rows auto-PUT on blur/change (key locked), draft rows are React Hook Form + zodResolver validated and committed via an imperative ref handle (commitDrafts())
    - A single page-level "Save Pack Framework" button drives two independent row-array forms via Promise.all([fieldsRef.commitDrafts(), filtersRef.commitDrafts()]) so one click commits both cards
    - Non-destructive DELETE: definition-row deletes never touch pois.custom_fields / pois.filter_values; proven per-route by a test that inserts a POI with a JSONB value under the key, deletes the definition, and re-reads the POI row via testDb
key-files:
  created:
    - api/src/routes/admin/filters.ts
    - api/src/routes/admin/filters.test.ts
    - admin/components/FrameworkFieldRows.tsx
    - admin/components/FrameworkFilterRows.tsx
  modified:
    - api/src/routes/admin/fields.ts
    - api/src/routes/admin/fields.test.ts
    - api/src/routes/admin/index.ts
    - api/src/routes/admin/packs.ts
    - admin/lib/api.ts
    - admin/app/packs/detail/page.tsx
    - admin/components.json (via shadcn add — no manual edit)
  added-ui-components:
    - admin/components/ui/alert-dialog.tsx
    - admin/components/ui/separator.tsx
decisions:
  - "Broadened fieldKey/filterKey regex from [a-z] to [a-zA-Z] (Rule 1 bug fix) — the plan's own <action> text said to keep the all-lowercase regex, but its <behavior>/<acceptance_criteria> require a mixed-case key like 'openLate' to be POSTable at all before the case-sensitive-uniqueness question is even reached. Uniqueness itself remains exact-string / non-normalized via unique(pack_id, field_key) and unique(pack_id, filter_key) — only the allowed character set changed."
  - "The 'Save Pack Framework' button lives at the page level (admin/app/packs/detail/page.tsx), not inside FrameworkFieldRows, because Task 2 requires the same button to commit both the Fields and Filters cards' unsaved rows in one click. Each row component exposes an imperative commitDrafts() handle via forwardRef/useImperativeHandle; the page calls both through Promise.all."
  - "Saved-row edits (label, dataType/filterType, options, isRequired) auto-save via PUT on blur/change rather than waiting for the primary button — the primary button's contract per the plan is specifically 'posts every unsaved row', i.e. new draft rows only."
  - "RemoveDefinitionButton (the shared AlertDialog remove-confirmation component) lives in FrameworkFieldRows.tsx and is imported by FrameworkFilterRows.tsx rather than duplicated, since both need byte-identical confirmation copy per 01-UI-SPEC.md, differing only in the dialog title ('Remove field' vs 'Remove filter')."
metrics:
  duration: "~65 minutes"
  completed: "2026-09-21"
status: complete
actuals:
  tokens: 18700
  tasks: 2
  commits: 4
---

# Phase 1 Plan 2: Pack Framework Builder Summary

Completed the pack framework builder ADMINFW-01/ADMINFW-02 require: every field data type (text,
number, boolean, url, phone, enum) and every filter type (boolean, single-select, multi-select) is
now definable, editable, and removable from one page, with removal proven non-destructive against
stored POI data via integration tests that read the POI row back out of Postgres.

## What Was Built

- **`api/src/routes/admin/fields.ts`** — extended from 01-01's single POST route to the full
  ADMINFW-01 surface: `GET`/`PUT`/`DELETE /v1/admin/packs/:id/framework/fields[/:fieldId]`.
  `CreateFieldSchema` gained a `superRefine` requiring `enumOptions` (>=1) exactly when
  `dataType: 'enum'`, and forbidding it otherwise. `UpdateFieldSchema` omits `fieldKey` entirely —
  a key is never renameable in place, since an in-place rename could orphan stored POI values
  under the old key. `DELETE` removes only the `pack_field_definitions` row; `pois.custom_fields`
  is never touched.
- **`api/src/routes/admin/filters.ts`** (new, ADMINFW-02) — mirrors `fields.ts`'s shape exactly:
  `CreateFilterSchema`/`UpdateFilterSchema`, the same status-code contract (201/200/204, 400
  `VALIDATION_FAILED`, 404 `PACK_NOT_FOUND`/`FILTER_NOT_FOUND`, 409 `FILTER_KEY_TAKEN`),
  `single-select`/`multi-select` requiring >=1 option, `boolean` carrying none, and a non-destructive
  `DELETE` against `pois.filter_values`.
- **`api/src/routes/admin/index.ts`** — registers `registerFilterRoutes` inside the same
  authenticated plugin scope as the other admin route modules.
- **`api/src/routes/admin/packs.ts`** — `GET /v1/admin/packs/:id` now returns
  `{ pack, fields, filters }`; a pack with saved fields and zero filters returns `filters: []`
  (explicitly asserted by a test) rather than omitting the key or erroring.
- **`admin/components/FrameworkFieldRows.tsx`** (D-03) — the repeatable-row component: saved rows
  render with the key input disabled (keys aren't renameable) and every other field editable,
  auto-saving via `PUT` on blur/change; unsaved rows are managed by React Hook Form +
  `useFieldArray` + `zodResolver` against a client mirror of `CreateFieldSchema`, and are committed
  through an imperative `commitDrafts()` ref handle rather than an internal button, so the page can
  drive both the Fields and Filters cards from one click. Zero saved + zero draft rows renders the
  exact "No fields yet" / "Add a field to start building this pack's data shape." empty state from
  01-UI-SPEC.md. Also exports `RemoveDefinitionButton`, the shared `AlertDialog` remove-confirmation
  (exact copy: `Remove '{label}'? Existing POI data isn't deleted, but this field/filter won't
  appear on POI forms until it's re-added.`), reused by the filters component.
- **`admin/components/FrameworkFilterRows.tsx`** (D-03) — the same repeatable-row pattern for
  ADMINFW-02: "No filters yet" empty state, "+ Add Filter" secondary button, options input shown
  only for `single-select`/`multi-select`, and its own `commitDrafts()` ref handle.
- **`admin/app/packs/detail/page.tsx`** — renders both cards (Filters below Fields, 2xl/48px major
  section break per 01-UI-SPEC.md's spacing scale) and hosts the single page-level "Save Pack
  Framework" button, which commits both cards' draft rows in parallel via
  `Promise.all([fieldsRef.current?.commitDrafts(), filtersRef.current?.commitDrafts()])`.
- **`admin/lib/api.ts`** — `listFields`/`updateField`/`removeField` and
  `listFilters`/`addFilter`/`updateFilter`/`removeFilter` added to `packApi`, plus the
  `PackFilterDefinition`/`CreateFilterInput`/`UpdateFilterInput` types; `packApi.get`'s return type
  now includes `filters`.
- **`admin/components/ui/{alert-dialog,separator}.tsx`** — shadcn components this task's UI needed,
  added via `npx shadcn add alert-dialog separator` (select/checkbox/skeleton already existed from
  01-01).

## Verification

- **TDD gate sequence** (both tasks): `test(01-02)` commit precedes its `feat(01-02)` commit —
  confirmed in `git log`. Each RED commit was verified failing before the GREEN implementation was
  written (13 field cases: 8 failing pre-implementation → 13/13 passing after; 10 filter cases: 10
  failing pre-implementation → all passing after).
- `npm --prefix api test` — **3 test files, 30 tests, all passing** (packs.test.ts's tracer + auth
  suite, fields.test.ts's 13 ADMINFW-01 cases, filters.test.ts's 10 new ADMINFW-02 cases), run
  clean multiple times across the session.
- `npm --prefix api run typecheck` — clean.
- `npm --prefix admin run build` — clean; `admin/.next/types` regenerated fresh in this worktree
  (a prior stale-`node_modules` `LayoutProps` typecheck error was a build-order artifact of the
  worktree never having run `next build`/`next dev` yet, not a regression — resolved by running the
  build once, per the plan's own verify step ordering).
- Non-destructive DELETE proven for both fields and filters: each test inserts a `poi_types` row
  and a `pois` row directly through `testDb` with a JSONB value under the definition's key,
  deletes the definition through the HTTP route, then re-selects the POI row through `testDb` and
  asserts the JSONB value is unchanged.
- A live browser walkthrough of the plan's `<human-check>` steps (empty states, "+ Add
  Field"/"+ Add Filter", enum/select-options conditional visibility, "Save Pack Framework"
  persisting and surviving reload, the removal confirmation copy) was **not** performed — no
  browser tool is available in this execution environment. `human_verify_mode` is `end-of-phase`
  and auto-chain mode is active, matching 01-01's own precedent for this same gap; a human should
  confirm the human-check steps in both 01-02-PLAN.md tasks before shipping this phase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] fieldKey/filterKey regex broadened from `[a-z]` to `[a-zA-Z]`**
- **Found during:** Task 1, first `npm --prefix api test -- fields` run after writing the RED tests
- **Issue:** The plan's Task 1 `<action>` explicitly says to "keep the existing `fieldKey` regex
  `^[a-z][a-z0-9_]{0,63}$`" — but the same task's `<behavior>` and `<acceptance_criteria>` require
  `POST`ing `openLate` and then `Openlate` to the same pack to both return 201. An all-lowercase
  regex rejects any uppercase character at the validation layer (400), before the case-sensitive
  uniqueness comparison the test is actually trying to exercise is ever reached — the two
  instructions in the same task contradict each other as written. Task 2 has the identical
  contradiction for `filterKey` (`open_late`/`Open_Late`).
- **Fix:** Broadened both regexes to `^[a-zA-Z][a-zA-Z0-9_]{0,63}$` — still requires a leading
  letter (rejects `24_hours`), still rejects embedded punctuation (rejects `open.24`), but now
  permits the mixed-case scenario the behavior spec tests. Uniqueness itself is unchanged: exact,
  case-sensitive, non-normalized comparison via `unique(pack_id, field_key)` /
  `unique(pack_id, filter_key)` — this fix only widens the character set the regex allows through
  to that comparison, it does not touch how equality is computed.
- **Files modified:** `api/src/routes/admin/fields.ts`, `api/src/routes/admin/filters.ts`
- **Commits:** `30208bf` (fields), `1d343b6` (filters)

**2. [Rule 3 - Blocking issue] `admin/.next/types` missing on first typecheck in this fresh worktree**
- **Found during:** Task 1, `npm --prefix admin run typecheck` (ran before any `next build`/`next
  dev` in this worktree)
- **Issue:** `tsc --noEmit` failed with `Cannot find name 'LayoutProps'` — `admin/app/layout.tsx`
  (written in 01-01, unmodified by this plan) uses Next.js 16's `LayoutProps<'/'>` ambient type,
  which is generated into `.next/types` by `next build`/`next dev`, not present from a clean
  `npm install` alone.
- **Fix:** Ran `npm --prefix admin run build` (already required by this plan's own `<verify>` step)
  before re-running typecheck; `.next/types` was generated as a side effect and both commands then
  passed cleanly. No source file was changed for this fix — it was purely a matter of verification
  ordering in this specific fresh worktree.
- **Files modified:** none (verification-ordering issue, not a code fix)

Neither deviation reached Rule 4 (architectural change): the regex fix resolves a direct
self-contradiction inside the plan's own Task 1/Task 2 text, and the typecheck ordering issue
required no code change at all.

## Known Stubs

None — every endpoint (`fields.ts` GET/PUT/DELETE, `filters.ts` full CRUD, `packs.ts`'s `filters`
key) and every UI surface (`FrameworkFieldRows`, `FrameworkFilterRows`, the page-level Save button)
is wired to a real Postgres round trip; nothing renders hardcoded/mock data.

## Threat Flags

None beyond what `01-02-PLAN.md`'s own `<threat_model>` already covers (T-01-01, T-01-03, T-01-04,
T-01-12, T-01-13) — `registerFilterRoutes` is mounted only inside `registerAdminRoutes` (T-01-01),
both `fieldKey`/`filterKey` regexes still bound the character set that can reach
`pois.custom_fields`/`pois.filter_values` as a JSONB object key (T-01-04, unaffected by the
case-widening fix above — digits-first and punctuation are still rejected), and both `DELETE`
routes are covered by the non-destructive-removal test T-01-12 requires.

## Self-Check: PASSED

Verified on disk: `api/src/routes/admin/fields.ts`, `api/src/routes/admin/filters.ts`,
`api/src/routes/admin/filters.test.ts`, `api/src/routes/admin/index.ts`,
`api/src/routes/admin/packs.ts`, `admin/lib/api.ts`, `admin/components/FrameworkFieldRows.tsx`,
`admin/components/FrameworkFilterRows.tsx`, `admin/app/packs/detail/page.tsx`,
`admin/components/ui/alert-dialog.tsx`, `admin/components/ui/separator.tsx` — all present.

Commit hashes verified present in `git log --oneline --all`:
- `24fb342` test(01-02): add failing coverage for full field-definition CRUD (ADMINFW-01)
- `30208bf` feat(01-02): full field-definition CRUD + framework builder UI (ADMINFW-01)
- `5c073fe` test(01-02): add failing coverage for filter-definition CRUD (ADMINFW-02)
- `1d343b6` feat(01-02): full filter-definition CRUD + framework builder UI (ADMINFW-02)

`git status --short` confirms a clean working tree — all task files committed, no stray untracked
or unstaged changes.
