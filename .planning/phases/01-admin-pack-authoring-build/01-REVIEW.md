---
phase: 01-admin-pack-authoring-build
reviewed: 2026-09-21T00:00:00Z
depth: standard
files_reviewed: 33
files_reviewed_list:
  - api/src/db/client.ts
  - api/src/middleware/adminAuth.ts
  - api/src/routes/admin/build.ts
  - api/src/routes/admin/fields.ts
  - api/src/routes/admin/fields.test.ts
  - api/src/routes/admin/filters.ts
  - api/src/routes/admin/filters.test.ts
  - api/src/routes/admin/index.ts
  - api/src/routes/admin/packs.ts
  - api/src/routes/admin/packs.test.ts
  - api/src/routes/admin/poiTypes.ts
  - api/src/routes/admin/pois.ts
  - api/src/routes/admin/pois.test.ts
  - api/src/server.ts
  - api/src/services/geocoding.ts
  - api/src/services/geocoding.test.ts
  - api/src/services/packBuild.ts
  - api/src/services/packBuild.test.ts
  - api/src/utils/errors.ts
  - api/test/setup.ts
  - admin/lib/api.ts
  - admin/lib/poiForm.ts
  - admin/lib/utils.ts
  - admin/app/page.tsx
  - admin/app/providers.tsx
  - admin/app/packs/page.tsx
  - admin/app/packs/detail/page.tsx
  - admin/app/packs/pois/new/page.tsx
  - admin/app/packs/pois/page.tsx
  - admin/app/packs/pois/edit/page.tsx
  - admin/components/FrameworkFieldRows.tsx
  - admin/components/FrameworkFilterRows.tsx
  - admin/components/GeocodeCandidateDialog.tsx
  - admin/components/GeocodeStatusBadge.tsx
  - admin/components/PackBuildPanel.tsx
  - admin/components/PoiFormFields.tsx
findings:
  critical: 2
  warning: 6
  info: 4
  total: 12
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-09-21
**Depth:** standard
**Files Reviewed:** 33
**Status:** issues_found

## Summary

The backend (fields/filters CRUD, POI CRUD, geocoding adapter, pack build) is well
structured and has unusually thorough unit/integration test coverage. Most of the
tricky business rules called out in comments (case-sensitive keys, no-rebill-on-
unchanged-address, path-escape defense-in-depth, unbounded missing-field report) are
correctly implemented and covered by tests that assert the specific behavior.

However, the test suite exercises the API exclusively through Fastify's
`app.inject()`, which does **not** reproduce how the real admin frontend's `fetch()`
client talks to the server. That gap hides two confirmed, reproducible defects that
break core admin actions end-to-end: **Build Pack**, **Retry Geocode**, **Remove
Field**, and **Remove Filter** all fail when driven from the actual browser client,
despite every corresponding backend test passing. Both are detailed below with a
runnable repro. There are also several data-integrity gaps around partial framework
updates and dataType enforcement that should be addressed before this ships.

## Critical Issues

### CR-01: Every body-less POST from the admin client is rejected with 400 by Fastify's default JSON parser

**File:** `admin/lib/api.ts:39-43` (root cause), consumed by `admin/lib/api.ts:277-280` (`packApi.build`) and `admin/lib/api.ts:311-314` (`poiApi.retryGeocode`)

**Issue:** `apiCall` unconditionally sets `'Content-Type': 'application/json'` on every request, including the two calls that intentionally send no body:

```ts
export async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  ...
}
```

Fastify's default JSON body parser throws `FST_ERR_CTP_EMPTY_JSON_BODY` (400 Bad
Request) whenever `Content-Type: application/json` is present but the body is empty
— *regardless of whether `Content-Length`/`Transfer-Encoding` is present*. This is
reproducible directly against the vendored Fastify in this repo:

```
$ node -e "..."   # POST with content-type: application/json, no payload
No payload, with content-type header: 400 {"statusCode":400,"code":"FST_ERR_CTP_EMPTY_JSON_BODY", ...}
No payload, no content-type header:   200 {}
```

Both `PackBuildPanel`'s "Build Pack" button (`packApi.build`, no body) and the Edit
POI screen's "Retry Geocode" button (`poiApi.retryGeocode`, no body) send exactly the
first shape from a real browser, so both requests will 400 before ever reaching
`build.ts` / `pois.ts`'s `/geocode` handler. This is invisible in the test suite
because every test drives the route through `app.inject({ method: 'POST', ... })`
**without** setting a `content-type` header (see `pois.test.ts:410-418`,
`packBuild.test.ts:368-378`), which takes Fastify's "no body to parse" fast path
instead of the JSON parser path a real fetch() call takes.

**Fix:** Only attach `Content-Type: application/json` when there is a body to send:

```ts
const headers: HeadersInit = {
  ...(options.body ? { 'Content-Type': 'application/json' } : {}),
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...options.headers,
};
```

Recommend also adding an integration test that exercises this through a real HTTP
listener (`app.listen()` + `fetch()`, not `inject()`) for at least one body-less POST,
so this class of bug can't regress silently again.

### CR-02: CORS `methods` allowlist omits `DELETE`, breaking Remove Field / Remove Filter from the browser

**File:** `api/src/server.ts:9-13`

**Issue:**

```ts
app.register(cors, {
  origin: process.env.ADMIN_ORIGIN ?? 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

`DELETE` is missing. `@fastify/cors` echoes this list verbatim into the
`Access-Control-Allow-Methods` response header on preflight `OPTIONS` requests
(confirmed in `node_modules/@fastify/cors/index.js`). The admin frontend calls
`DELETE` for both "Remove field" and "Remove filter"
(`admin/lib/api.ts:257-260` `removeField`, `admin/lib/api.ts:273-276`
`removeFilter`, wired up from `FrameworkFieldRows.tsx` / `FrameworkFilterRows.tsx`).
Since `DELETE` is a non-simple method, the browser preflights it first; because the
server's preflight response never lists `DELETE` as allowed, the browser blocks the
actual request and it never reaches the server. Both "Remove field" and "Remove
filter" buttons in the admin UI are non-functional as shipped, even though
`fields.test.ts` / `filters.test.ts` cover the route successfully via `app.inject()`
(which bypasses CORS entirely).

Note this compounds with CR-01: even after adding `DELETE` here, `removeField` /
`removeFilter` still send `Content-Type: application/json` with no body, and `DELETE`
is in Fastify's `bodywith` method set — so the CR-01 fix is required too before these
two actions work end-to-end.

**Fix:**

```ts
methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
```

## Warnings

### WR-01: Framework field/filter PUT lets an admin switch to `enum`/`select` types without supplying options, leaving a broken definition

**File:** `api/src/routes/admin/fields.ts:46-75` (`UpdateFieldSchema`), `api/src/routes/admin/filters.ts:45-73` (`UpdateFilterSchema`)

**Issue:** `CreateFieldSchema`/`CreateFilterSchema` require `enumOptions`/`options`
whenever the type is `enum`/`single-select`/`multi-select` (good). The corresponding
`Update*Schema` only enforces this **when `enumOptions`/`options` is present in the
same request** (`data.enumOptions !== undefined`). `FrameworkFieldRows.tsx`'s
`SavedFieldRow` fires `onUpdate({ dataType: value })` the instant the admin changes
the "Data Type" select — with no `enumOptions` in that request — so the server
happily accepts `{ dataType: 'enum' }` alone, producing a stored field with
`dataType: 'enum'` and `enumOptions: null` (or whatever it was before). Until the
admin separately blurs the (now-visible) options input, `PoiFormFields.tsx`'s
`FieldControl`/`FilterControl` render an empty `<Select>`/checkbox list for that
field, so **no value can be entered for it on any POI** in the interim. The same gap
exists for filters switching to `single-select`/`multi-select`.

**Fix:** In both `superRefine`s, treat a `dataType`/`filterType` transition to a
type that needs options as requiring options in that same payload, not only when
`enumOptions`/`options` happens to also be present:

```ts
if (data.dataType === 'enum' && (!data.enumOptions || data.enumOptions.length === 0)) {
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'enum fields require at least one enumOptions value', path: ['enumOptions'] });
}
```
(and require the client to send the current/edited options alongside a type change
in the same request, rather than as two separate `onBlur`/`onValueChange` calls).

### WR-02: Client-side schema forces required boolean custom fields to always be `true`, blocking legitimate `false` answers

**File:** `admin/lib/poiForm.ts:39-57` (`buildPoiDynamicSchema`)

**Issue:**

```ts
if (field.dataType === 'boolean') {
  shape[field.fieldKey] = field.isRequired
    ? z.literal(true, { message: `${field.label} is required.` })
    : z.boolean().optional();
  continue;
}
```

The server's own definition of "required" (`packBuild.ts`'s `validateRequiredFields`)
only checks *presence* — `undefined`/`null`/`''` count as missing, `false` is a valid,
present value. The admin form's zod schema instead requires the literal value `true`
for any required boolean field, so an admin can never save `false` for a required
boolean custom field (e.g. a required "Serves Alcohol" field whose true answer is
"no") — the form will perpetually show "X is required." and block submission. This
is a real mismatch between client validation and the server's own semantics.

**Fix:** Use `z.boolean()` for a required boolean field (require *presence*, not
`true`):

```ts
shape[field.fieldKey] = field.isRequired
  ? z.boolean({ required_error: `${field.label} is required.` })
  : z.boolean().optional();
```

### WR-03: `customFields`/`filterValues` values are never validated against their field/filter's declared `dataType` server-side

**File:** `api/src/routes/admin/pois.ts:15-27` (`CreatePoiSchema`), `api/src/routes/admin/pois.ts:79-99` (`findAllowedKeys`)

**Issue:** `CreatePoiSchema`/`UpdatePoiSchema` type `customFields`/`filterValues` as
`z.record(z.string(), z.unknown())`. `findAllowedKeys` (T-01-14) only checks that the
submitted *keys* correspond to a real field/filter definition — it never checks that
a `number` field's value is numeric, a `boolean` field's value is a boolean, a `url`
field's value is a valid URL, or that a `single-select` filter's value is one of its
declared `options`. The admin frontend's own zod schema (`poiForm.ts`) enforces this
client-side, but any direct API caller (or a future non-browser client) with a valid
admin token can push arbitrary types into these JSONB columns. `packBuild.ts` copies
`custom_fields`/`filter_values` straight into the shipped pack file with no further
validation, so malformed values reach the on-device app.

**Fix:** After `findAllowedKeys`, validate each submitted value against its field's
`dataType` / filter's `filterType` (+`options` membership for select types) and
reject with `400 INVALID_FIELD_VALUE_TYPE` (or similar) rather than accepting
anything.

### WR-04: `GeocodeCandidateDialog.handleConfirm` has no error handling — a failed candidate selection is a silent, unhandled rejection

**File:** `admin/components/GeocodeCandidateDialog.tsx:38-49`

**Issue:**

```ts
async function handleConfirm() {
  if (selectedIndex === null) return;
  setIsSubmitting(true);
  try {
    await poiApi.selectCandidate(poiId, selectedIndex);
    setSelectedIndex(null);
    onOpenChange(false);
    onResolved();
  } finally {
    setIsSubmitting(false);
  }
}
```

There is no `catch`. If `poiApi.selectCandidate` throws (e.g. a stale
`selectedCandidateIndex` now out of range, a network error, or a 409
`NO_CANDIDATES_STORED` if the row changed underneath the open dialog), the error
propagates as an unhandled promise rejection with no toast/user feedback — the admin
sees the dialog just sit there with the "Confirm" button re-enabled and no
indication anything went wrong.

**Fix:**

```ts
try {
  await poiApi.selectCandidate(poiId, selectedIndex);
  setSelectedIndex(null);
  onOpenChange(false);
  onResolved();
} catch (err) {
  const code = err instanceof ApiError ? err.code : 'UNKNOWN_ERROR';
  toast.error(`Failed to select candidate: ${code}`);
} finally {
  setIsSubmitting(false);
}
```

### WR-05: `GEOCODE_CONFIDENCE_THRESHOLD` is parsed with no validation — a misconfigured value silently forces every geocode to `low_confidence`

**File:** `api/src/services/geocoding.ts:267`

**Issue:** `const threshold = Number(process.env.GEOCODE_CONFIDENCE_THRESHOLD ?? '0.7');`
If this env var is ever set to a non-numeric string, `Number(...)` is `NaN`, and
every subsequent comparison `confidence >= threshold` evaluates to `false` (NaN
comparisons are always false) — even a perfect rooftop match (`confidence === 1.0`)
would be downgraded to `low_confidence`/flagged. This fails silently rather than
loudly at startup, and every POI created while misconfigured would need to be
re-geocoded once fixed.

**Fix:** Validate at module load / in `performGeocode`:

```ts
const rawThreshold = process.env.GEOCODE_CONFIDENCE_THRESHOLD ?? '0.7';
const threshold = Number(rawThreshold);
if (!Number.isFinite(threshold)) {
  throw new AppError(500, 'GEOCODING_CONFIG_MISSING', `GEOCODE_CONFIDENCE_THRESHOLD is not a number: "${rawThreshold}"`);
}
```

### WR-06: `buildStandardPack`'s next-version computation is a TOCTOU race with no friendly error mapping

**File:** `api/src/services/packBuild.ts:180-186` (compute `nextVersion`), `:245-258` (transaction)

**Issue:** `nextVersion` is computed via a `SELECT ... ORDER BY version DESC LIMIT 1`
that runs *before* the transaction that inserts the new `packVersions` row. Two
concurrent `POST /v1/admin/packs/:id/build` calls for the same pack (e.g. a
double-click, or two admins) can both read the same `maxVersionRow` and both attempt
to insert the same `(packId, nextVersion)` pair. `pack_versions` has a
`unique(packId, version)` constraint (`db/schema.ts:107`), so the second transaction
will throw a raw Postgres unique-violation error that `buildStandardPack` does not
catch — it propagates as an unmapped 500 rather than a clear "someone else is
building this pack, try again" `AppError`.

**Fix:** Either serialize the version computation and insert inside the same
transaction (`SELECT ... FOR UPDATE` or compute `nextVersion` from inside `tx`), or
catch the unique-violation Postgres error code (`23505`) around the transaction and
re-map it to a retryable `AppError` (e.g. `409 BUILD_IN_PROGRESS`).

## Info

### IN-01: `isPostgresError`/`POSTGRES_UNIQUE_VIOLATION` duplicated across four route files

**File:** `api/src/routes/admin/fields.ts:77-81`, `filters.ts:75-79`, `packs.ts:18-22`, `poiTypes.ts:15-19`

**Issue:** The exact same helper function and constant are copy-pasted in four
files. Any future change (e.g. handling a second Postgres error code) needs to be
made in four places.

**Fix:** Extract to a shared `api/src/utils/postgresErrors.ts` and import it.

### IN-02: `PackBuildPanel` can render stale success data next to a newer failure banner

**File:** `admin/components/PackBuildPanel.tsx:80-96, 104-114`

**Issue:** `buildMutation.data` (from the last *successful* build) is not cleared
when a subsequent build attempt fails; `useMutation` keeps the last `data` around
independent of the latest call's `isError`/`error`. If an admin successfully builds,
then adds a POI that breaks a required-field constraint and builds again, the panel
will simultaneously show the previous build's "Current version / POIs included /
Checksum" summary *and* the new `MISSING_REQUIRED_FIELDS` failure banner, which can
read as if the successful build also had the newly-reported problem.

**Fix:** Reset `buildMutation` state (`buildMutation.reset()`) at the start of a new
`mutate()` call, or key the "latest" summary off `queryClient`'s cached pack data
instead of `buildMutation.data`.

### IN-03: No numeric-format validation anywhere in the stack for `dataType: 'number'` custom fields

**File:** `admin/lib/poiForm.ts:39-57`, `api/src/routes/admin/pois.ts:15-27`

**Issue:** `buildPoiDynamicSchema` uses a plain `z.string()` base for every
non-boolean, non-enum field (including `dataType: 'number'`), only adding `.url()`
for `dataType: 'url'`. There is no numeric-format check anywhere — the `<Input
type="number">` rendered by `PoiFormFields.tsx`'s `FieldControl` is bound through
plain `form.register(path)`, so its value is a string and nothing rejects
non-numeric text either client- or server-side (see also WR-03, which covers the
server side of this same gap).

**Fix:** Add a numeric-string check for `dataType === 'number'` (e.g.
`base.regex(/^-?\d+(\.\d+)?$/, 'Enter a number.')`), matching the same pattern used
for `url`.

### IN-04: `adminAuth.ts` reveals server misconfiguration to any unauthenticated caller

**File:** `api/src/middleware/adminAuth.ts:5-9`

**Issue:**

```ts
const expectedToken = process.env.ADMIN_API_TOKEN;
if (!expectedToken) {
  reply.status(500).send({ error: 'ADMIN_API_TOKEN not configured' });
  return;
}
```

This check runs before the `Authorization` header is even inspected, so any
unauthenticated request against a misconfigured deployment discloses the specific
internal misconfiguration ("ADMIN_API_TOKEN not configured") rather than a generic
401/403. Low impact (requires a server-side misconfiguration to trigger, and reveals
no secret), but worth tightening for defense-in-depth.

**Fix:** Log the misconfiguration server-side and return a generic
`{ error: 'Unauthorized' }` (401) to the caller instead of describing the
misconfiguration in the response body.

---

_Reviewed: 2026-09-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
