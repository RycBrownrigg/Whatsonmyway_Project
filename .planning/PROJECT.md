# What's On My Way

## What This Is

An iPhone/iPad app where a user plans a route (point A → point B), picks a search radius off that route (1, 5, 10, 25, or 50 miles), and sees points of interest (POIs) within that corridor. POI data comes from purchasable "Packs" — focused databases (e.g., all Waffle Houses, or unusual roadside attractions) — each with its own pack-specific filters. State Packs are a derived pack type containing every POI (across all types) within a given state. This is Ryc's first commercial iOS/iPadOS app.

## Core Value

A user can plan a route and reliably discover accurate, relevant POIs within their chosen radius entirely offline once a pack is downloaded — on-device search must always work, regardless of network state.

## Business Context

- **Customer**: End users who buy individual Packs via Apple In-App Purchase for road-trip POI data
- **Revenue model**: Per-pack non-consumable purchases (Apple StoreKit 2), no subscription
- **Success metric**: TBD — pending the minimum viable launch pack set and pricing tiers (open item in the spec)
- **Strategy notes**: `Product Specification.md` (repo root) — source of truth for all product and technical decisions

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can plan a route (typed start/end, no location permission) and search POIs within a selectable radius (1/5/10/25/50 mi) using on-device data (UC-1)
- [ ] User can view full POI detail, including pack-specific fields and the optional `additional_info` note (UC-2)
- [ ] User can purchase a pack via Apple IAP, with purchase decoupled from download (UC-3)
- [ ] User can restore purchases on a new or reinstalled device (UC-4)
- [ ] User can filter results by pack-specific filter values (UC-5)
- [ ] User can manage which installed packs are active without losing purchased data (UC-6)
- [ ] User can buy and use State Packs, which surface cross-type POIs scoped to one state (UC-7)
- [ ] App and pack updates are detected and applied via resumable, checksum-verified downloads with format-version guarding (UC-8)
- [ ] Revoked/refunded packs are handled correctly — downloads blocked, local data preserved (UC-9)
- [ ] User can submit feedback / a data-correction report (UC-10)
- [ ] Admin can author a pack framework (fields/filters) (UC-11)
- [ ] Admin can add a POI manually, with geocoding (UC-12)
- [ ] Admin can import a POI dataset with validation, geocoding, and duplicate detection (UC-13)
- [ ] Admin can build/rebuild a standard pack (UC-14) and a state pack (UC-15)
- [ ] Admin can triage user feedback submissions (UC-16)

### Out of Scope

- Android/web end-user client — iPhone/iPad only; web is admin-only (spec §1)
- Device location permission for v1 — start/end always typed/selected; deferred until usage data justifies the added permission/review overhead (spec §1, Open Items)
- Third-party self-serve pack authorship — admin-curated only for now; third-party submissions are manually imported, not automated (spec §1)
- R-tree spatial indexing — deferred until the Phase 1 benchmark shows the bounding-box + haversine approach is insufficient (spec §10, §18)

## Context

- Full technical spec already exists: `Product Specification.md` (repo root, Draft v2) — SQL schema, Drizzle schema, on-device SQLite schema, 17 API endpoints, 16 use cases, 34 test cases, route-sampling algorithm, error taxonomy, and an existing phased roadmap (Phase 0–6). This GSD roadmap re-derives phases from requirements and should land close to that existing structure.
- Codebase map exists at `.planning/codebase/` (mapped 2026-09-20). Current implementation: `api/` (Fastify + Drizzle) has the full DB schema and a Docker Compose scaffold (`wowm-db`, `wowm-api`), but only a `/healthz` route — no auth, no business endpoints, no tests. `app/` (Expo) and `admin/` (Next.js) are not yet scaffolded.
- Ryc is an enrolled Apple Developer — Sign in with Apple / StoreKit sandbox access is not a blocker.
- This is Ryc's first commercial iOS/iPadOS app — new to iOS/StoreKit development.
- Deployment target: Ryc's own VPS (`rycsprojects`), following the same Docker + nginx + certbot pattern as his existing `ebay-api`/`ddd-api` services there.
- No changes to any spec decision as of this initialization (confirmed 2026-09-20) — the spec remains source of truth; this project's docs stay in sync with it per the repo's `CLAUDE.md` convention.

## Constraints

- **Tech stack**: Backend Fastify + TypeScript + Drizzle ORM + PostgreSQL 16; iOS app Expo (React Native) + TypeScript; admin Next.js (static export) + TypeScript — locked in spec §2
- **Payments**: Apple StoreKit only, no parallel payment path (spec §1, `CLAUDE.md`)
- **Privacy**: No device location permission for v1 — explicit product decision, simplest possible privacy label (spec §1)
- **Offline-first**: End-user search must always work on-device with zero network calls; the backend is never in the search hot path (spec §1, `CLAUDE.md`)
- **Platform**: iPhone/iPad only — no Android/web end-user client (spec §1)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Treat the entire Product Specification as one GSD project rather than slicing it into separate milestones per spec phase | User's explicit choice — let the roadmapper re-derive phases from the full spec instead of scoping just Phase 0 | — Pending |
| No changes to existing spec decisions at project init | User confirmed nothing has changed since Draft v2 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-20 after initialization*
