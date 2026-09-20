# Phase 1: Admin Pack Authoring & Build - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-20
**Phase:** 1-Admin Pack Authoring & Build
**Areas discussed:** Admin Authentication, Geocoding Review Flow, Pack Framework Builder UX, Pack Build Failure Reporting
**Mode:** `--auto` — no AskUserQuestion calls made; Claude auto-selected the recommended option for every gray area and logged it here for audit.

---

## Admin Authentication

| Option | Description | Selected |
|--------|-------------|----------|
| Shared bearer token (`ADMIN_API_TOKEN`) | Single env-var token, checked via Fastify preHandler on all `/v1/admin/*` routes; minimal login screen in admin web | ✓ |
| Full admin-user accounts + login | `admin_users` table, session/login flow, per-admin credentials | |
| No auth (local-only trust) | Rely on VPS network boundary alone | |

**Claude's choice:** Shared bearer token.
**Notes:** Directly resolves the spec's own open item ("whether admin auth is a separate, simpler mechanism... given single-admin usage"), which explicitly names "single shared login" as the candidate. Matches current reality: Ryc is the sole admin. Flagged in CONTEXT.md as `costly` to reverse (needs a real login flow later) but not destructive.

---

## Geocoding Review Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Inline status badge + edit-to-fix | Flagged POIs show a badge in the POI list; admin edits and re-geocodes from the same form | ✓ |
| Dedicated review-queue screen | Separate screen listing only flagged POIs | |

**Claude's choice:** Inline status badge.
**Notes:** Simpler for Phase 1's low volume (manual entry only, no bulk import yet). Reversible — a dedicated queue can be added later without a data model change.

---

## Pack Framework Builder UX

| Option | Description | Selected |
|--------|-------------|----------|
| Single-page form, repeatable rows | "Add Field" / "Add Filter" rows on one page | ✓ |
| Multi-step wizard | Separate steps for fields, then filters, then review | |

**Claude's choice:** Single-page form.
**Notes:** Matches spec's low field/filter counts per pack and single-admin, low-volume usage — a wizard would add friction without benefit here.

---

## Pack Build Failure Reporting

| Option | Description | Selected |
|--------|-------------|----------|
| Inline table on pack detail page | POI name + missing field(s) shown directly | ✓ |
| Downloadable CSV report | Export the failure list as a file | |

**Claude's choice:** Inline table.
**Notes:** TC-27 only requires the build to "report which POIs/fields are missing" — no format is specified, and single-admin low-volume usage doesn't need an export step.

---

## Claude's Discretion

- Scaffolding `admin/` via `create-next-app` (per `CLAUDE.md` convention), then adding shadcn/ui + Tailwind CSS per spec §2.
- New admin routes under `api/src/routes/admin/`; Zod for request validation (already a dependency, previously unused).
- No schema changes needed — existing Drizzle schema already covers Phase 1.

## Deferred Ideas

- Multi-admin / role-based admin accounts — until usage justifies it.
- Bulk CSV import — explicitly Phase 6, not Phase 1.
- Dedicated geocoding review-queue screen — revisit if flagged-POI volume grows.
