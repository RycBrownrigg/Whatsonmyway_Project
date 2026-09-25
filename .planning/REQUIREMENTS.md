# Requirements: What's On My Way

**Defined:** 2026-09-20
**Core Value:** A user can plan a route and reliably discover accurate, relevant POIs within their chosen radius entirely offline once a pack is downloaded.

## v1 Requirements

Derived directly from `Product Specification.md` §8 (Use Cases) and §9 (Test Cases). Each maps to roadmap phases.

### Route Search

- [ ] **ROUTE-01**: User can enter/select a start location and an end location without granting device location permission (UC-1)
- [ ] **ROUTE-02**: User can select a search radius (1, 5, 10, 25, or 50 miles) (UC-1)
- [ ] **ROUTE-03**: App calculates the route via MapKit and samples it per the route-sampling algorithm (§10) (UC-1)
- [ ] **ROUTE-04**: App queries on-device pack data for active packs within the selected radius and displays results attributed to their originating pack (UC-1)
- [ ] **ROUTE-05**: Changing the radius on a completed search updates results without triggering a new route calculation (TC-2)

### POI Detail

- [ ] **POI-01**: User can view a POI's full detail — name, address, phone, website, pack-specific filter values (UC-2)
- [ ] **POI-02**: POI detail shows the `additional_info` note only when non-empty (UC-2)

### Purchases & Entitlements

- [ ] **PURCH-01**: User can purchase a pack via StoreKit; a successful transaction is verified server-side and recorded as an entitlement (UC-3)
- [ ] **PURCH-02**: Pack download begins independently of transaction verification completion; a failed download never affects the entitlement (UC-3)
- [ ] **PURCH-03**: A user who already owns a pack is offered a re-download instead of a duplicate charge (TC-15)
- [ ] **PURCH-04**: User can restore purchases on a new/reinstalled device, reconciling entitlements from Apple's transaction history (UC-4)
- [ ] **PURCH-05**: A refunded/revoked pack blocks further downloads/updates and surfaces `ENTITLEMENT_REVOKED`, while already-downloaded local data remains untouched (UC-9)

### Filtering

- [ ] **FILTER-01**: User can filter results by one or more pack-specific filter values, narrowing to matching POIs across currently active packs (UC-5)

### Pack Management

- [ ] **PACK-01**: User can view installed packs with an active/inactive toggle (UC-6)
- [ ] **PACK-02**: Deactivating a pack removes its POIs from results and grays out (does not hide) its filters; reactivating restores both (UC-6)
- [ ] **PACK-03**: Newly purchased/downloaded packs auto-activate by default (spec §12)

### State Packs

- [ ] **STATE-01**: User can purchase and use a State Pack; results are limited to state-pack POIs within the radius of the route, naturally scoped by the pack's state membership (UC-7)

### Updates & Delivery

- [ ] **UPDATE-01**: App checks app version and each installed pack's manifest for updates (UC-8)
- [ ] **UPDATE-02**: A pack update downloads resumably (Range-based) and validates checksum before swapping in; a corrupted download auto-retries (UC-8, TC-21, TC-22)
- [ ] **UPDATE-03**: A pack `format_version` newer than the app supports is refused, prompting an app update rather than a partial parse (UC-8, TC-23)
- [ ] **UPDATE-04**: An app version below the minimum supported version shows an update-required state (UC-8, TC-24)
- [ ] **UPDATE-05**: A pending on-device schema migration runs to completion before any pack install/update path is available; a failed migration blocks pack operations without partial/corrupted state (TC-25, TC-26)

### Feedback

- [ ] **FEEDBACK-01**: User can submit a feedback / data-correction report from a POI detail view (pre-filled) or Settings (blank), without requiring sign-in (UC-10)

### Admin — Pack Framework

- [x] **ADMINFW-01**: Admin can define a pack's fields (key, label, data type, required flag) (UC-11)
- [x] **ADMINFW-02**: Admin can define a pack's filters (key, label, type, options) (UC-11)

### Admin — POI Management

- [x] **ADMINPOI-01**: Admin can add a POI manually; the address is geocoded via Smarty and stored with status/confidence (UC-12)
- [x] **ADMINPOI-02**: A failed or low-confidence geocode flags the POI for review and excludes it from pack builds until resolved (UC-12)

### Admin — Import Pipeline

- [ ] **ADMINIMPORT-01**: Admin can upload a dataset file and start an import job scoped to a target POI type (UC-13)
- [ ] **ADMINIMPORT-02**: An import missing a column required by the target pack's framework halts immediately with `MISSING_REQUIRED_COLUMN` (UC-13, TC-30)
- [ ] **ADMINIMPORT-03**: Rows with invalid/missing optional data are flagged but the import continues (UC-13, TC-31)
- [ ] **ADMINIMPORT-04**: Rows with an unresolvable address are flagged with `failed` geocode status and excluded from pack builds until corrected (UC-13, TC-32)
- [ ] **ADMINIMPORT-05**: Rows matching an existing master POI (normalized name + street + city/state) are flagged `DUPLICATE_SUSPECTED`, never auto-merged (UC-13, TC-33)
- [ ] **ADMINIMPORT-06**: Admin can review an import's status and row-level errors (UC-13)

### Admin — Pack Building

- [x] **ADMINBUILD-01**: Admin can build/rebuild a standard pack from all active, successfully-geocoded master POIs of its POI type; a missing required field fails the build and reports which POIs/fields are missing (UC-14, TC-27, TC-28)
- [ ] **ADMINBUILD-02**: Admin can build/rebuild a state pack from all active, successfully-geocoded master POIs in that state across all POI types, preserving each POI's pack-of-origin filters/fields (UC-15, TC-29)

### Admin — Feedback Triage

- [ ] **ADMINTRIAGE-01**: Admin can view and triage open feedback submissions, marking them resolved after making the corresponding correction (UC-16)

## v2 Requirements

None currently deferred — the whole spec is in scope for this project (see Key Decisions in PROJECT.md). Revisit if the roadmap needs to push anything out.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Android / web end-user client | iPhone/iPad only per spec §1; web is admin-only |
| Device location permission (v1) | Start/end always typed/selected; deferred until usage data justifies the added permission/review overhead (spec §1) |
| Third-party self-serve pack authorship | Admin-curated only for now; third-party submissions are manually imported, not automated (spec §1) |
| R-tree spatial indexing | Deferred until the Phase 1 benchmark shows bounding-box + haversine is insufficient (spec §10, §18) |
| "Use current location" convenience button | Explicitly deferred by design until usage data justifies it (spec §1, Open Items) |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ADMINFW-01 | Phase 1 | Complete |
| ADMINFW-02 | Phase 1 | Complete |
| ADMINPOI-01 | Phase 1 | Complete |
| ADMINPOI-02 | Phase 1 | Complete |
| ADMINBUILD-01 | Phase 1 | Complete |
| ROUTE-01 | Phase 2 | Pending |
| ROUTE-02 | Phase 2 | Pending |
| ROUTE-03 | Phase 2 | Pending |
| ROUTE-04 | Phase 2 | Pending |
| ROUTE-05 | Phase 2 | Pending |
| POI-01 | Phase 2 | Pending |
| POI-02 | Phase 2 | Pending |
| PURCH-01 | Phase 3 | Pending |
| PURCH-02 | Phase 3 | Pending |
| PURCH-03 | Phase 3 | Pending |
| PURCH-04 | Phase 3 | Pending |
| PURCH-05 | Phase 3 | Pending |
| FILTER-01 | Phase 4 | Pending |
| PACK-01 | Phase 4 | Pending |
| PACK-02 | Phase 4 | Pending |
| PACK-03 | Phase 4 | Pending |
| STATE-01 | Phase 4 | Pending |
| ADMINBUILD-02 | Phase 4 | Pending |
| UPDATE-01 | Phase 5 | Pending |
| UPDATE-02 | Phase 5 | Pending |
| UPDATE-03 | Phase 5 | Pending |
| UPDATE-04 | Phase 5 | Pending |
| UPDATE-05 | Phase 5 | Pending |
| ADMINIMPORT-01 | Phase 6 | Pending |
| ADMINIMPORT-02 | Phase 6 | Pending |
| ADMINIMPORT-03 | Phase 6 | Pending |
| ADMINIMPORT-04 | Phase 6 | Pending |
| ADMINIMPORT-05 | Phase 6 | Pending |
| ADMINIMPORT-06 | Phase 6 | Pending |
| FEEDBACK-01 | Phase 6 | Pending |
| ADMINTRIAGE-01 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 36 total
- Mapped to phases: 36/36
- Unmapped: 0

---
*Requirements defined: 2026-09-20*
*Last updated: 2026-09-20 after roadmap creation*
