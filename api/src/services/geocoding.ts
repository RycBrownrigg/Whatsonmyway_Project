import { z } from 'zod';
import { AppError } from '../utils/errors.js';

// Product Specification.md §17 — Geocoding Strategy. Smarty is named in this
// file and nowhere else under api/src/, so the provider can be swapped later
// without touching import/admin logic (T-01-05 depends on this boundary
// holding — see 01-03-PLAN.md's threat model).
const SMARTY_US_STREET_HOST = 'https://us-street.api.smarty.com/street-address';

const RETRY_DELAYS_MS = [250, 1000];
const REQUEST_TIMEOUT_MS = 5000;

// Short-lived in-process memo: collapses duplicate provider calls for the
// same address within one admin session (for example a PUT save immediately
// followed by a page reload that re-derives the same normalizeAddressKey).
// This is deliberately NOT the §17 "don't re-bill on unchanged address"
// control — that's enforced at the route layer by comparing address keys
// and skipping geocodeAddress entirely. This memo is a smaller, separate
// safety net inside the same process for calls that do reach this function.
const GEOCODE_MEMO_TTL_MS = 15 * 60 * 1000;
const geocodeMemo = new Map<string, { result: GeocodeResult; storedAt: number }>();

// Exported for tests: clears the memo so one test's cached result cannot
// make a later test pass vacuously (a fresh geocodeMemo per beforeEach).
export function clearGeocodeMemo(): void {
  geocodeMemo.clear();
}

export interface AddressInput {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface GeocodeCandidate {
  address: string;
  latitude: number;
  longitude: number;
}

export interface GeocodeResult {
  status: 'ok' | 'low_confidence' | 'failed';
  latitude: number | null;
  longitude: number | null;
  confidence: number | null;
  candidates: GeocodeCandidate[] | null;
  errorCode: string | null;
}

// The cache key §17 asks for: lowercase, trim, collapse internal whitespace,
// strip punctuation, join the four address parts with a single space — so
// two spellings of the same address ("123 Main St." vs "123 main st")
// produce the same key.
export function normalizeAddressKey(input: AddressInput): string {
  const raw = `${input.street} ${input.city} ${input.state} ${input.zip}`;
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
    .replace(/\s+/g, ' ');
}

// Smarty's US Street Address API response envelope — one entry per matched
// candidate, empty array when nothing matches. Parsed before any value is
// touched so a malformed payload becomes PROVIDER_ERROR rather than a bad
// coordinate reaching the database (T-01-06).
const SmartyCandidateSchema = z.object({
  delivery_line_1: z.string().optional(),
  last_line: z.string().optional(),
  metadata: z.object({
    latitude: z.number(),
    longitude: z.number(),
    precision: z.string(),
  }),
  analysis: z.object({
    dpv_match_code: z.string().nullable().optional(),
  }),
});

const SmartyResponseSchema = z.array(SmartyCandidateSchema);

type SmartyCandidate = z.infer<typeof SmartyCandidateSchema>;

// Precision-grade buckets used to score a single-candidate match into the
// 0-1 confidence range the route layer compares against
// GEOCODE_CONFIDENCE_THRESHOLD. Smarty's `metadata.precision` values run
// Zip5 (ZIP-centroid) through Zip9 (rooftop); a live-docs lookup was not
// available in this environment (see 01-03-SUMMARY.md), so this bucketing is
// this adapter's own documented assumption, not a value copied from Smarty's
// current reference — revisit once real Smarty responses are seen (the
// pilot import in spec §17 is the natural place to confirm it).
const ROOFTOP_GRADE_PRECISIONS = new Set(['Zip9']);
const BLOCK_GRADE_PRECISIONS = new Set(['Zip8', 'Zip7', 'Zip6']);
const ZIP_CENTROID_PRECISIONS = new Set(['Zip5']);

function scoreCandidate(candidate: SmartyCandidate): number {
  const matchCode = candidate.analysis.dpv_match_code ?? null;
  const precision = candidate.metadata.precision;

  // dpv_match_code N is an explicit non-match — never let a ZIP-centroid
  // precision score it as 0.3 just because a ZIP-level result came back.
  if (matchCode === 'N') return 0.0;
  if (matchCode === 'Y') {
    if (ROOFTOP_GRADE_PRECISIONS.has(precision)) return 1.0;
    if (BLOCK_GRADE_PRECISIONS.has(precision)) return 0.8;
    // A confirmed match without a recognized grade still gets the
    // block-grade score rather than falling through to 0 — a `Y` match
    // is never treated as "not found".
    return 0.8;
  }
  if (matchCode === 'S' || matchCode === 'D') return 0.5;
  if (ZIP_CENTROID_PRECISIONS.has(precision)) return 0.3;
  return 0.0;
}

function candidateToGeocodeCandidate(candidate: SmartyCandidate): GeocodeCandidate {
  const address = [candidate.delivery_line_1, candidate.last_line]
    .filter((part): part is string => Boolean(part && part.length > 0))
    .join(', ');
  return {
    address,
    latitude: candidate.metadata.latitude,
    longitude: candidate.metadata.longitude,
  };
}

function providerErrorResult(): GeocodeResult {
  return {
    status: 'failed',
    latitude: null,
    longitude: null,
    confidence: null,
    candidates: null,
    errorCode: 'PROVIDER_ERROR',
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestSmarty(
  input: AddressInput,
  authId: string,
  authToken: string,
): Promise<SmartyCandidate[] | null> {
  const url = new URL(SMARTY_US_STREET_HOST);
  url.searchParams.set('auth-id', authId);
  url.searchParams.set('auth-token', authToken);
  url.searchParams.set('street', input.street);
  url.searchParams.set('city', input.city);
  url.searchParams.set('state', input.state);
  url.searchParams.set('zipcode', input.zip);
  url.searchParams.set('candidates', '10');

  let response: Response;
  try {
    response = await fetch(url.toString(), { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    // Network error or aborted request — treated the same as a non-2xx by
    // the caller's retry loop.
    return null;
  }

  if (!response.ok) {
    return null;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }

  const parsed = SmartyResponseSchema.safeParse(body);
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

// Issues one GET to the Smarty US Street Address API, retrying up to two
// more times (250ms then 1000ms backoff) on a non-2xx response, an aborted
// request, or a malformed payload. §15: "surface to the admin only once
// retries are exhausted" — this loop is where that is honoured.
//
// `bypassMemo` is consulted before this ever reaches the provider: an
// explicit admin "Retry Geocode" action must always reach Smarty, even when
// the address is unchanged and a fresh memo entry exists for it — otherwise
// the memo would silently satisfy the admin's explicit retry from cache,
// contradicting the very behavior this plan requires ("POST /geocode with no
// body always issues a provider call, even when the address is unchanged").
// A provider error is deliberately never memoized: it's a transient failure
// of the call, not a stable fact about the address, so it must not block a
// legitimate retry attempt within the memo's 15-minute window.
export async function geocodeAddress(
  input: AddressInput,
  options: { bypassMemo?: boolean } = {},
): Promise<GeocodeResult> {
  const memoKey = normalizeAddressKey(input);
  if (!options.bypassMemo) {
    const cached = geocodeMemo.get(memoKey);
    if (cached && Date.now() - cached.storedAt < GEOCODE_MEMO_TTL_MS) {
      return cached.result;
    }
  }

  const result = await performGeocode(input);
  if (result.errorCode !== 'PROVIDER_ERROR') {
    geocodeMemo.set(memoKey, { result, storedAt: Date.now() });
  }
  return result;
}

async function performGeocode(input: AddressInput): Promise<GeocodeResult> {
  const authId = process.env.SMARTY_AUTH_ID;
  const authToken = process.env.SMARTY_AUTH_TOKEN;
  if (!authId) {
    throw new AppError(500, 'GEOCODING_CONFIG_MISSING', 'SMARTY_AUTH_ID is not set.');
  }
  if (!authToken) {
    throw new AppError(500, 'GEOCODING_CONFIG_MISSING', 'SMARTY_AUTH_TOKEN is not set.');
  }

  const attempts = [0, ...RETRY_DELAYS_MS];
  let candidates: SmartyCandidate[] | null = null;

  for (let i = 0; i < attempts.length; i += 1) {
    if (attempts[i] > 0) {
      await delay(attempts[i]);
    }
    candidates = await requestSmarty(input, authId, authToken);
    if (candidates !== null) break;
  }

  if (candidates === null) {
    return providerErrorResult();
  }

  if (candidates.length === 0) {
    return {
      status: 'failed',
      latitude: null,
      longitude: null,
      confidence: null,
      candidates: null,
      errorCode: 'ADDRESS_NOT_FOUND',
    };
  }

  if (candidates.length > 1) {
    return {
      status: 'low_confidence',
      latitude: null,
      longitude: null,
      confidence: null,
      candidates: candidates.map(candidateToGeocodeCandidate),
      errorCode: 'ADDRESS_AMBIGUOUS',
    };
  }

  const [only] = candidates;
  const confidence = scoreCandidate(only);
  const threshold = Number(process.env.GEOCODE_CONFIDENCE_THRESHOLD ?? '0.7');

  if (confidence === 0) {
    return {
      status: 'failed',
      latitude: null,
      longitude: null,
      confidence,
      candidates: null,
      errorCode: 'ADDRESS_NOT_FOUND',
    };
  }

  const geocodeCandidate = candidateToGeocodeCandidate(only);
  if (confidence >= threshold) {
    return {
      status: 'ok',
      latitude: geocodeCandidate.latitude,
      longitude: geocodeCandidate.longitude,
      confidence,
      candidates: null,
      errorCode: null,
    };
  }

  return {
    status: 'low_confidence',
    latitude: geocodeCandidate.latitude,
    longitude: geocodeCandidate.longitude,
    confidence,
    candidates: null,
    errorCode: 'LOW_CONFIDENCE_MATCH',
  };
}
