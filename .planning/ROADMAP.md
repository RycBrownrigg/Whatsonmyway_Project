# Roadmap: What's On My Way

## Overview

The codebase today is a backend scaffold only: `api/` has the full Drizzle schema
and a Docker Compose stack, but exposes nothing beyond `/healthz` — no auth, no
business routes, no tests. `app/` (Expo) and `admin/` (Next.js) don't exist yet.
This roadmap builds the whole spec as six vertical slices, each one delivering a
complete, user-observable capability rather than a horizontal technical layer.

The journey: first give the admin a way to get real POI data into the system and
build a downloadable pack (Phase 1) — nothing else can be tested end-to-end
without that. Then stand up the iOS app's core walking skeleton — route search
and POI detail against that on-device pack data (Phase 2). Once search works,
wrap pack acquisition in real Apple commerce (Phase 3), then round out
multi-pack ownership with filtering, activation management, and State Packs
(Phase 4). With real packs circulating, harden the update/versioning/migration
path so nothing corrupts on-device state over time (Phase 5). Finally, scale
data entry beyond manual admin work via the import pipeline and close the loop
with user feedback and admin triage (Phase 6).

Every phase after the first depends on the one before it — there is no
parallel track here; each slice needs the previous slice's real, working
capability (not a mock) to build on.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Admin Pack Authoring & Build** - Admin can define a pack's fields/filters, manually add geocoded POIs, and build a downloadable standard pack
- [ ] **Phase 2: Core Route Search & POI Detail** - User can plan a route, search on-device pack data within a radius, and view full POI detail
- [ ] **Phase 3: Purchases & Entitlements** - User can buy, restore, and lose access to packs entirely through Apple StoreKit, server-verified
- [ ] **Phase 4: Pack Management, Filtering & State Packs** - User can manage multiple active packs, filter results, and buy/use cross-type State Packs
- [ ] **Phase 5: Updates, Delivery & Schema Migration** - App and packs detect, download, and apply updates safely without corrupting on-device state
- [ ] **Phase 6: Import Pipeline & Feedback Loop** - Admin can import datasets at scale; users report issues and admin triages them to resolution

## Phase Details

### Phase 1: Admin Pack Authoring & Build

**Goal**: Admin can go from an empty catalog to a build-ready standard pack using only manually-entered data — no import pipeline required yet.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: ADMINFW-01, ADMINFW-02, ADMINPOI-01, ADMINPOI-02, ADMINBUILD-01
**Success Criteria** (what must be TRUE):

  1. Admin can open the pack framework screen and define a pack's fields (key, label, data type, required flag) and filters (key, label, type, options) for a POI type.
  2. Admin can fill out the "Add POI" form with an address that gets geocoded automatically via Smarty, with status/confidence stored.
  3. A POI whose address fails to geocode or geocodes with low confidence is flagged for review and excluded from any pack build.
  4. Admin can trigger a standard pack build from the pack detail view that includes all active, successfully-geocoded POIs of that pack's POI type, and a missing required field blocks the build with a clear report of which POIs/fields are missing.

**Plans**: 2/5 plans executed

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Walking Skeleton: scaffold `admin/`, shared-token admin auth, and an end-to-end pack create + framework field round trip

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Pack framework builder: all six field data types and three filter types on one page, with non-destructive removal

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 01-03-PLAN.md — Manual POI entry: Smarty geocoding adapter, POI types, geocode-on-save, POI list with status badges

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 01-04-PLAN.md — Geocode review: pre-filled edit form, Retry Geocode, ambiguous-candidate picker, no re-billing on unchanged addresses

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 01-05-PLAN.md — Standard pack build: required-field validation, `pack_pois` snapshot, checksummed pack file, versioned release

**UI hint**: yes

### Phase 2: Core Route Search & POI Detail

**Goal**: A user can plan a route end-to-end and see accurate, attributed POI results and full detail, entirely from on-device pack data — no purchase flow required yet (the Phase 1 pack downloads directly).
**Mode:** mvp
**Depends on**: Phase 1 (needs at least one built, downloadable pack to search against)
**Requirements**: ROUTE-01, ROUTE-02, ROUTE-03, ROUTE-04, ROUTE-05, POI-01, POI-02
**Success Criteria** (what must be TRUE):

  1. User can enter/select a start and end location on the route search screen without granting device location permission.
  2. User can choose a search radius (1/5/10/25/50 mi) and see a MapKit-calculated, sampled route with POIs from active on-device packs, each attributed to its originating pack.
  3. Changing the radius after a completed search updates the results list immediately without triggering a new route calculation.
  4. User can tap a POI to open its detail view — name, address, phone, website, pack-specific filter values — with the `additional_info` note shown only when non-empty.

**Plans**: TBD
**UI hint**: yes

### Phase 3: Purchases & Entitlements

**Goal**: Pack acquisition moves entirely onto real Apple commerce — every pack a user owns is backed by a server-verified StoreKit transaction, and revocation is handled correctly.
**Mode:** mvp
**Depends on**: Phase 2 (wraps the existing download path in entitlement gating)
**Requirements**: PURCH-01, PURCH-02, PURCH-03, PURCH-04, PURCH-05
**Success Criteria** (what must be TRUE):

  1. User can browse the Pack Store screen and buy a pack via the Apple StoreKit payment sheet; the transaction is verified server-side and recorded as an entitlement before the pack is treated as owned.
  2. Pack download begins as soon as the entitlement is recorded, independent of the transaction sheet closing, and a failed download never affects the entitlement.
  3. A user who reopens the store for a pack they already own is offered a re-download, never a duplicate charge.
  4. User can tap "Restore Purchases" on a new/reinstalled device and have all previously-owned packs' entitlements reconciled from Apple's transaction history.
  5. A refunded/revoked pack blocks further downloads/updates and surfaces a clear "revoked" message, while any already-downloaded local data stays intact and searchable.

**Plans**: TBD
**UI hint**: yes

### Phase 4: Pack Management, Filtering & State Packs

**Goal**: Users can own and manage several packs at once — including cross-type State Packs — narrowing results with pack-specific filters, without ever losing purchased data.
**Mode:** mvp
**Depends on**: Phase 3 (multi-pack ownership needs the real purchase flow); Phase 1 (state pack build reuses the admin build tooling)
**Requirements**: FILTER-01, PACK-01, PACK-02, PACK-03, STATE-01, ADMINBUILD-02
**Success Criteria** (what must be TRUE):

  1. User can view all installed packs on the Pack Management screen with an active/inactive toggle, and newly purchased/downloaded packs are active by default.
  2. Deactivating a pack removes its POIs from results and grays out (but doesn't hide) its filters in the filters panel; reactivating restores both instantly.
  3. User can filter current results by one or more pack-specific filter values across all currently active packs at once.
  4. User can buy and use a State Pack, and a route search returns only that state pack's POIs within the radius, naturally scoped to where the route passes through that state.
  5. Admin can build/rebuild a state pack from the pack detail view, selecting all active, geocoded master POIs in that state across every POI type, preserving each POI's pack-of-origin filters/fields.

**Plans**: TBD
**UI hint**: yes

### Phase 5: Updates, Delivery & Schema Migration

**Goal**: The app and its packs stay correct and current over time — version skew, interrupted downloads, and pending migrations are all handled without ever corrupting on-device data.
**Mode:** mvp
**Depends on**: Phase 4 (needs multiple real packs/versions in circulation to exercise update paths meaningfully)
**Requirements**: UPDATE-01, UPDATE-02, UPDATE-03, UPDATE-04, UPDATE-05
**Success Criteria** (what must be TRUE):

  1. On launch (or a manual check), the app detects available app and pack updates by comparing versions and `format_version` against local state.
  2. A pack update downloads resumably (Range-based) and validates its checksum before swapping in; a corrupted download automatically retries rather than corrupting the installed pack.
  3. A pack whose `format_version` is newer than the app supports is refused with a message prompting an app update, rather than being partially parsed.
  4. An app version below the minimum supported version shows an update-required screen that blocks further pack operations until the app is updated.
  5. A pending on-device schema migration runs to completion before any pack install/update is allowed, and a failed migration blocks pack operations cleanly rather than leaving partial/corrupted state.

**Plans**: TBD
**UI hint**: yes

### Phase 6: Import Pipeline & Feedback Loop

**Goal**: Admin can populate packs at scale from external datasets instead of manual entry, and both users and admin can close the data-quality feedback loop.
**Mode:** mvp
**Depends on**: Phase 1 (import feeds the same master-POI/pack-build pipeline); Phase 2 (feedback pre-fills from POI detail)
**Requirements**: ADMINIMPORT-01, ADMINIMPORT-02, ADMINIMPORT-03, ADMINIMPORT-04, ADMINIMPORT-05, ADMINIMPORT-06, FEEDBACK-01, ADMINTRIAGE-01
**Success Criteria** (what must be TRUE):

  1. Admin can upload a dataset file from the import screen and start an import job scoped to a target POI type.
  2. An import missing a column required by the target pack's framework halts immediately with `MISSING_REQUIRED_COLUMN` rather than partially importing.
  3. Rows with invalid/missing optional data are flagged but the import continues; rows with an unresolvable address are flagged `failed` and excluded from pack builds until corrected.
  4. Rows matching an existing master POI (normalized name + street + city/state) are flagged `DUPLICATE_SUSPECTED` rather than auto-merged, and admin can review an import's status and row-level errors on the import detail view afterward.
  5. A user can submit a feedback/data-correction report via a form — pre-filled from a POI detail view, or blank from Settings — without signing in, and admin can triage open submissions on the feedback queue screen, marking each resolved after making the corresponding correction.

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Admin Pack Authoring & Build | 2/5 | In Progress|  |
| 2. Core Route Search & POI Detail | 0/TBD | Not started | - |
| 3. Purchases & Entitlements | 0/TBD | Not started | - |
| 4. Pack Management, Filtering & State Packs | 0/TBD | Not started | - |
| 5. Updates, Delivery & Schema Migration | 0/TBD | Not started | - |
| 6. Import Pipeline & Feedback Loop | 0/TBD | Not started | - |

---
*Roadmap created: 2026-09-20*
*Granularity: standard (6 phases)*
*Mode: mvp — every phase is a vertical, user-observable slice*
