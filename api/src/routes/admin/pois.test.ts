import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { ADMIN_TOKEN_FOR_TESTS, buildTestApp, resetDb, testDb } from '../../../test/setup.js';
import { pois } from '../../db/schema.js';

function authHeaders() {
  return { authorization: `Bearer ${ADMIN_TOKEN_FOR_TESTS}` };
}

async function createPoiType(app: ReturnType<typeof buildTestApp>) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/admin/poi-types',
    headers: authHeaders(),
    payload: { slug: 'diner', name: 'Diner' },
  });
  return response.json();
}

function smartyCandidate(overrides: {
  dpvMatchCode?: string | null;
  precision?: string;
  latitude?: number;
  longitude?: number;
}) {
  return {
    delivery_line_1: '123 Main St',
    last_line: 'Springfield IL 62701',
    metadata: {
      latitude: overrides.latitude ?? 39.78,
      longitude: overrides.longitude ?? -89.65,
      precision: overrides.precision ?? 'Zip9',
    },
    analysis: { dpv_match_code: overrides.dpvMatchCode ?? 'Y' },
  };
}

function fakeResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

function mockSmarty(candidates: unknown[]) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse(candidates));
}

function validPoiPayload(poiTypeId: string, overrides: Record<string, unknown> = {}) {
  return {
    poiTypeId,
    name: 'Joe’s Diner',
    addressStreet: '123 Main St',
    addressCity: 'Springfield',
    addressState: 'IL',
    addressZip: '62701',
    ...overrides,
  };
}

describe('admin pois (ADMINPOI-01)', () => {
  beforeEach(async () => {
    await resetDb();
    vi.stubEnv('SMARTY_AUTH_ID', 'test-auth-id');
    vi.stubEnv('SMARTY_AUTH_TOKEN', 'test-auth-token');
    vi.stubEnv('GEOCODE_CONFIDENCE_THRESHOLD', '0.7');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('stores non-null coordinates, geocode_status ok, and status active for a clean match', async () => {
    const app = buildTestApp();
    const poiType = await createPoiType(app);
    mockSmarty([smartyCandidate({ dpvMatchCode: 'Y', precision: 'Zip9' })]);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/pois',
      headers: authHeaders(),
      payload: validPoiPayload(poiType.id),
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(typeof body.latitude).toBe('number');
    expect(typeof body.longitude).toBe('number');
    expect(body.geocodeStatus).toBe('ok');
    expect(body.status).toBe('active');
    expect(body.geocodeErrorCode).toBeNull();
  });

  it('stores a failed/flagged POI with null coordinates when the address resolves to zero candidates', async () => {
    const app = buildTestApp();
    const poiType = await createPoiType(app);
    mockSmarty([]);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/pois',
      headers: authHeaders(),
      payload: validPoiPayload(poiType.id),
    });

    expect(response.statusCode).toBe(201);
    const created = response.json();
    expect(created.geocodeErrorCode).toBe('ADDRESS_NOT_FOUND');

    const [row] = await testDb.select().from(pois).where(eq(pois.id, created.id));
    expect(row.latitude).toBeNull();
    expect(row.longitude).toBeNull();
    expect(row.geocodeStatus).toBe('failed');
    expect(row.status).toBe('flagged');
  });

  it('stores low_confidence with a populated geocode_candidates array and null coordinates for a multi-candidate match', async () => {
    const app = buildTestApp();
    const poiType = await createPoiType(app);
    mockSmarty([
      smartyCandidate({}),
      smartyCandidate({ latitude: 40.1, longitude: -90.1 }),
      smartyCandidate({ latitude: 40.2, longitude: -90.2 }),
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/pois',
      headers: authHeaders(),
      payload: validPoiPayload(poiType.id),
    });

    expect(response.statusCode).toBe(201);
    const created = response.json();

    const [row] = await testDb.select().from(pois).where(eq(pois.id, created.id));
    expect(row.geocodeStatus).toBe('low_confidence');
    expect(row.latitude).toBeNull();
    expect(row.longitude).toBeNull();
    expect(Array.isArray(row.geocodeCandidates)).toBe(true);
    expect((row.geocodeCandidates as unknown[]).length).toBeGreaterThan(1);
  });

  it('stores low_confidence/flagged for a below-threshold single match', async () => {
    const app = buildTestApp();
    const poiType = await createPoiType(app);
    mockSmarty([smartyCandidate({ dpvMatchCode: 'S', precision: 'Zip6' })]);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/pois',
      headers: authHeaders(),
      payload: validPoiPayload(poiType.id),
    });

    expect(response.statusCode).toBe(201);
    const created = response.json();
    expect(created.geocodeErrorCode).toBe('LOW_CONFIDENCE_MATCH');

    const [row] = await testDb.select().from(pois).where(eq(pois.id, created.id));
    expect(row.geocodeStatus).toBe('low_confidence');
    expect(row.status).toBe('flagged');
  });

  it('returns 404 POI_TYPE_NOT_FOUND for an unknown poiTypeId', async () => {
    const app = buildTestApp();
    mockSmarty([smartyCandidate({})]);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/pois',
      headers: authHeaders(),
      payload: validPoiPayload('00000000-0000-0000-0000-000000000000'),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('POI_TYPE_NOT_FOUND');
  });

  it('returns 400 VALIDATION_FAILED when addressState is missing', async () => {
    const app = buildTestApp();
    const poiType = await createPoiType(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/pois',
      headers: authHeaders(),
      payload: {
        poiTypeId: poiType.id,
        name: 'Joe’s Diner',
        addressStreet: '123 Main St',
        addressCity: 'Springfield',
        addressZip: '62701',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('VALIDATION_FAILED');
  });

  it('round-trips a several-thousand-character additionalInfo value byte-identical', async () => {
    const app = buildTestApp();
    const poiType = await createPoiType(app);
    mockSmarty([smartyCandidate({})]);
    const longNote = 'A'.repeat(5000);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/pois',
      headers: authHeaders(),
      payload: validPoiPayload(poiType.id, { additionalInfo: longNote }),
    });

    expect(response.statusCode).toBe(201);
    const created = response.json();

    const [row] = await testDb.select().from(pois).where(eq(pois.id, created.id));
    expect(row.additionalInfo).toBe(longNote);
    expect(row.additionalInfo?.length).toBe(5000);
  });

  it('GET /v1/admin/pois lists POIs ordered by name', async () => {
    const app = buildTestApp();
    const poiType = await createPoiType(app);
    mockSmarty([smartyCandidate({})]);

    await app.inject({
      method: 'POST',
      url: '/v1/admin/pois',
      headers: authHeaders(),
      payload: validPoiPayload(poiType.id, { name: 'Zeta Diner' }),
    });
    await app.inject({
      method: 'POST',
      url: '/v1/admin/pois',
      headers: authHeaders(),
      payload: validPoiPayload(poiType.id, { name: 'Alpha Diner' }),
    });

    const response = await app.inject({
      method: 'GET',
      url: `/v1/admin/pois?poiTypeId=${poiType.id}`,
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(200);
    const names = response.json().map((p: { name: string }) => p.name);
    expect(names).toEqual(['Alpha Diner', 'Zeta Diner']);
  });

  it('requires auth on both /v1/admin/poi-types and /v1/admin/pois — proving they are only mounted inside registerAdminRoutes', async () => {
    const app = buildTestApp();

    const poiTypesResponse = await app.inject({ method: 'GET', url: '/v1/admin/poi-types' });
    expect(poiTypesResponse.statusCode).toBe(401);

    const poisResponse = await app.inject({ method: 'GET', url: '/v1/admin/pois' });
    expect(poisResponse.statusCode).toBe(401);
  });
});
