---
status: testing
phase: 01-admin-pack-authoring-build
source: [01-VERIFICATION.md]
started: 2026-09-25T00:00:00Z
updated: 2026-09-25T00:00:00Z
---

## Current Test

number: 1
name: Sign-in, pack-create, and framework-field round trip (01-01)
expected: |
  Wrong token shows the exact "Invalid token — check the value in your .env file and try again." copy;
  correct token reaches /packs; creating a pack shows a toast and appears in the table; adding a field
  on /packs/detail persists across reload.
awaiting: user response

## Tests

### 1. Sign-in, pack-create, and framework-field round trip (01-01)
expected: With `docker compose up` (wowm-db) + `npm --prefix api run dev` + `npm --prefix admin run dev` running, open http://localhost:3000 and walk sign-in → create a pack → add a framework field. Wrong token shows the exact error copy; correct token reaches /packs; creating a pack shows a toast and appears in the table; adding a field on /packs/detail persists across reload.
result: [pending]

### 2. Framework builder empty states, repeatable rows, conditional inputs, remove dialog (01-02)
expected: On /packs/detail?id=..., "No fields yet" / equivalent filters empty state; "+ Add Field"/"+ Add Filter" append rows; enum/select option inputs appear only for the right data/filter types; Remove opens the AlertDialog with the exact non-destructive copy naming the field/filter label.
result: [pending]

### 3. Geocode status badges + long-text truncation (01-03)
expected: On /packs/pois?packId=..., a real address shows a green "Geocoded" badge; a deliberately wrong address shows a red "Failed" badge with the inline "We couldn't verify this address..." copy; a long POI name/address truncates with a hover tooltip showing the full value. Requires live SMARTY_AUTH_ID/SMARTY_AUTH_TOKEN in api/.env.
result: [pending]

### 4. Geocode review — edit, retry, status transitions (01-04)
expected: Correcting a flagged POI's address flips the badge to Geocoded; re-saving without touching the address keeps it Geocoded (no re-bill); Retry Geocode on a still-broken address always re-calls the provider and reports the inline error copy. Requires live Smarty credentials.
result: [pending]

### 5. Ambiguous-candidate picker dialog (01-04)
expected: Triggering an ambiguous geocode (address matching multiple candidates) opens a dialog listing one line per candidate, nothing pre-selected, confirm disabled until a row is picked; a many-candidate result scrolls inside the dialog rather than overflowing. Requires live Smarty credentials.
result: [pending]

### 6. Build Pack — all four scenarios (01-05)
expected: On /packs/detail?id=..., walk: (a) zero-POI rejection copy, (b) a 3-POI missing-required-field failure table with working POI-name links, (c) a successful build showing the "Building…" in-flight label and success toast wording, (d) a rebuild that increments the version and POI count. Exact copy and version/count numbers match at each step.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps

None — all 6 items are live-browser visual/interactive confirmations that could not be automated in this execution environment (no browser tool available). No code-level gap was found by automated verification: 4/4 ROADMAP success criteria and 20/20 plan must-haves verified, 79/79 tests passing, both typechecks and the admin build clean.

Two additional items from the verifier's original human-verification list were process/bookkeeping issues, not user-facing tests, and have already been resolved directly:
- ROADMAP.md's `Mode: mvp` / non-User-Story-goal mismatch — fixed by adding a `**User Story:**` line to Phase 1's roadmap entry.
- ROADMAP.md's stale `01-05` checkbox and "4/5 plans executed" — corrected to reflect all 5 plans complete.
