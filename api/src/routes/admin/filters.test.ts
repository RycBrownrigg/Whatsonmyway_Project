import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { ADMIN_TOKEN_FOR_TESTS, buildTestApp, resetDb, testDb } from '../../../test/setup.js';
import { poiTypes, pois } from '../../db/schema.js';

async function createPack(app: ReturnType<typeof buildTestApp>) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/admin/packs',
    headers: { authorization: `Bearer ${ADMIN_TOKEN_FOR_TESTS}` },
    payload: {
      name: 'Roadside Attractions',
      slug: 'roadside-attractions',
      packType: 'standard',
      appleProductId: 'com.wowm.pack.roadside-attractions',
    },
  });
  return response.json();
}

function authHeaders() {
  return { authorization: `Bearer ${ADMIN_TOKEN_FOR_TESTS}` };
}

describe('admin framework filters (ADMINFW-02)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('returns an empty filters array and empty-state-ready data for a pack with no filters', async () => {
    const app = buildTestApp();
    const pack = await createPack(app);

    const response = await app.inject({
      method: 'GET',
      url: `/v1/admin/packs/${pack.id}/framework/filters`,
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it('creates and reads back a filter of each of the three filter types', async () => {
    const app = buildTestApp();
    const pack = await createPack(app);

    const rows = [
      { filterKey: 'is_24_hours', label: 'Open 24 Hours', filterType: 'boolean' },
      { filterKey: 'cuisine', label: 'Cuisine', filterType: 'single-select', options: ['diner', 'bbq'] },
      { filterKey: 'amenities', label: 'Amenities', filterType: 'multi-select', options: ['wifi', 'parking'] },
    ];

    for (const row of rows) {
      const response = await app.inject({
        method: 'POST',
        url: `/v1/admin/packs/${pack.id}/framework/filters`,
        headers: authHeaders(),
        payload: row,
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().filterType).toBe(row.filterType);
    }

    const list = await app.inject({
      method: 'GET',
      url: `/v1/admin/packs/${pack.id}/framework/filters`,
      headers: authHeaders(),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(3);
  });

  it('returns 400 VALIDATION_FAILED for single-select with empty options', async () => {
    const app = buildTestApp();
    const pack = await createPack(app);

    const response = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/framework/filters`,
      headers: authHeaders(),
      payload: { filterKey: 'cuisine', label: 'Cuisine', filterType: 'single-select', options: [] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('VALIDATION_FAILED');
  });

  it('returns 400 VALIDATION_FAILED for multi-select with absent options', async () => {
    const app = buildTestApp();
    const pack = await createPack(app);

    const response = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/framework/filters`,
      headers: authHeaders(),
      payload: { filterKey: 'amenities', label: 'Amenities', filterType: 'multi-select' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('VALIDATION_FAILED');
  });

  it('returns 201 for a boolean filter with no options', async () => {
    const app = buildTestApp();
    const pack = await createPack(app);

    const response = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/framework/filters`,
      headers: authHeaders(),
      payload: { filterKey: 'is_24_hours', label: 'Open 24 Hours', filterType: 'boolean' },
    });

    expect(response.statusCode).toBe(201);
  });

  it('treats case-differing keys as distinct — both open_late and Open_Late can be created', async () => {
    const app = buildTestApp();
    const pack = await createPack(app);

    const first = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/framework/filters`,
      headers: authHeaders(),
      payload: { filterKey: 'open_late', label: 'Open Late', filterType: 'boolean' },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/framework/filters`,
      headers: authHeaders(),
      payload: { filterKey: 'Open_Late', label: 'Open Late (alt)', filterType: 'boolean' },
    });
    expect(second.statusCode).toBe(201);
  });

  it('returns 409 FILTER_KEY_TAKEN for a duplicate filterKey on the same pack', async () => {
    const app = buildTestApp();
    const pack = await createPack(app);

    const first = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/framework/filters`,
      headers: authHeaders(),
      payload: { filterKey: 'open_late', label: 'Open Late', filterType: 'boolean' },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/framework/filters`,
      headers: authHeaders(),
      payload: { filterKey: 'open_late', label: 'Open Late Again', filterType: 'boolean' },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: 'FILTER_KEY_TAKEN' });
  });

  it('deletes a filter definition without touching a POI filter_values value stored under that key', async () => {
    const app = buildTestApp();
    const pack = await createPack(app);

    const filterResponse = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/framework/filters`,
      headers: authHeaders(),
      payload: { filterKey: 'open_late', label: 'Open Late', filterType: 'boolean' },
    });
    expect(filterResponse.statusCode).toBe(201);
    const filter = filterResponse.json();

    const [poiType] = await testDb.insert(poiTypes).values({ slug: 'diner', name: 'Diner' }).returning();
    const filterValues = { open_late: true };
    const [poi] = await testDb
      .insert(pois)
      .values({
        poiTypeId: poiType.id,
        name: 'Test Diner',
        addressStreet: '123 Main St',
        addressCity: 'Springfield',
        addressState: 'IL',
        addressZip: '62701',
        filterValues,
      })
      .returning();

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/packs/${pack.id}/framework/filters/${filter.id}`,
      headers: authHeaders(),
    });
    expect(deleteResponse.statusCode).toBe(204);

    const [reread] = await testDb.select().from(pois).where(eq(pois.id, poi.id));
    expect(reread.filterValues).toEqual(filterValues);
  });

  it('returns filters: [] from GET /v1/admin/packs/:id for a pack that has fields but no filters', async () => {
    const app = buildTestApp();
    const pack = await createPack(app);

    const fieldResponse = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/framework/fields`,
      headers: authHeaders(),
      payload: { fieldKey: 'notes', label: 'Notes', dataType: 'text' },
    });
    expect(fieldResponse.statusCode).toBe(201);

    const detail = await app.inject({
      method: 'GET',
      url: `/v1/admin/packs/${pack.id}`,
      headers: authHeaders(),
    });

    expect(detail.statusCode).toBe(200);
    const body = detail.json();
    expect(body.fields).toHaveLength(1);
    expect(body.filters).toEqual([]);
  });

  it('returns 404 FILTER_NOT_FOUND when PUTting a filter that does not exist', async () => {
    const app = buildTestApp();
    const pack = await createPack(app);

    const response = await app.inject({
      method: 'PUT',
      url: `/v1/admin/packs/${pack.id}/framework/filters/00000000-0000-0000-0000-000000000000`,
      headers: authHeaders(),
      payload: { label: 'Renamed' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('FILTER_NOT_FOUND');
  });
});
