import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { ADMIN_TOKEN_FOR_TESTS, buildTestApp, resetDb, testDb } from '../../../test/setup.js';
import { packFieldDefinitions, poiTypes, pois } from '../../db/schema.js';

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

describe('admin framework fields (ADMINFW-01)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('writes a field definition that reads back out of Postgres', async () => {
    const app = buildTestApp();
    const pack = await createPack(app);

    const response = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/framework/fields`,
      headers: authHeaders(),
      payload: {
        fieldKey: 'is_open_24_hours',
        label: 'Open 24 Hours',
        dataType: 'boolean',
        isRequired: true,
      },
    });

    expect(response.statusCode).toBe(201);
    const created = response.json();

    const [row] = await testDb
      .select()
      .from(packFieldDefinitions)
      .where(eq(packFieldDefinitions.id, created.id));

    expect(row).toBeDefined();
    expect(row.fieldKey).toBe('is_open_24_hours');
    expect(row.label).toBe('Open 24 Hours');
    expect(row.dataType).toBe('boolean');
    expect(row.isRequired).toBe(true);
    expect(row.packId).toBe(pack.id);
  });

  it('returns 400 VALIDATION_FAILED for a fieldKey starting with a digit', async () => {
    const app = buildTestApp();
    const pack = await createPack(app);

    const response = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/framework/fields`,
      headers: authHeaders(),
      payload: { fieldKey: '24_hours', label: 'Open 24 Hours', dataType: 'boolean' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('VALIDATION_FAILED');
  });

  it('returns 400 VALIDATION_FAILED for a fieldKey containing a dot', async () => {
    const app = buildTestApp();
    const pack = await createPack(app);

    const response = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/framework/fields`,
      headers: authHeaders(),
      payload: { fieldKey: 'open.24', label: 'Open 24 Hours', dataType: 'boolean' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('VALIDATION_FAILED');
  });

  it('returns 409 FIELD_KEY_TAKEN for a duplicate fieldKey on the same pack', async () => {
    const app = buildTestApp();
    const pack = await createPack(app);

    const first = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/framework/fields`,
      headers: authHeaders(),
      payload: { fieldKey: 'is_open_24_hours', label: 'Open 24 Hours', dataType: 'boolean' },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/framework/fields`,
      headers: authHeaders(),
      payload: { fieldKey: 'is_open_24_hours', label: 'Open Late', dataType: 'boolean' },
    });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: 'FIELD_KEY_TAKEN' });
  });

  it('creates and reads back a field of each of the six data types', async () => {
    const app = buildTestApp();
    const pack = await createPack(app);

    const rows: Array<{ fieldKey: string; label: string; dataType: string; enumOptions?: string[] }> = [
      { fieldKey: 'notes', label: 'Notes', dataType: 'text' },
      { fieldKey: 'capacity', label: 'Capacity', dataType: 'number' },
      { fieldKey: 'is_open_24_hours', label: 'Open 24 Hours', dataType: 'boolean' },
      { fieldKey: 'website_url', label: 'Website', dataType: 'url' },
      { fieldKey: 'contact_phone', label: 'Phone', dataType: 'phone' },
      { fieldKey: 'size_category', label: 'Size Category', dataType: 'enum', enumOptions: ['small', 'medium', 'large'] },
    ];

    for (const row of rows) {
      const response = await app.inject({
        method: 'POST',
        url: `/v1/admin/packs/${pack.id}/framework/fields`,
        headers: authHeaders(),
        payload: row,
      });
      expect(response.statusCode).toBe(201);
      const created = response.json();
      expect(created.dataType).toBe(row.dataType);
    }

    const list = await app.inject({
      method: 'GET',
      url: `/v1/admin/packs/${pack.id}/framework/fields`,
      headers: authHeaders(),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(6);
  });

  it('returns 400 VALIDATION_FAILED for an enum field with empty enumOptions', async () => {
    const app = buildTestApp();
    const pack = await createPack(app);

    const response = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/framework/fields`,
      headers: authHeaders(),
      payload: { fieldKey: 'size_category', label: 'Size Category', dataType: 'enum', enumOptions: [] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('VALIDATION_FAILED');
  });

  it('returns 400 VALIDATION_FAILED for an enum field with absent enumOptions', async () => {
    const app = buildTestApp();
    const pack = await createPack(app);

    const response = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/framework/fields`,
      headers: authHeaders(),
      payload: { fieldKey: 'size_category', label: 'Size Category', dataType: 'enum' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('VALIDATION_FAILED');
  });

  it('returns 400 and inserts nothing for a non-empty label with an empty fieldKey', async () => {
    const app = buildTestApp();
    const pack = await createPack(app);

    const response = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/framework/fields`,
      headers: authHeaders(),
      payload: { fieldKey: '', label: 'Open 24 Hours', dataType: 'boolean' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('VALIDATION_FAILED');

    const rows = await testDb
      .select()
      .from(packFieldDefinitions)
      .where(eq(packFieldDefinitions.packId, pack.id));
    expect(rows).toHaveLength(0);
  });

  it('treats case-differing keys as distinct — both Openlate and openLate can be created', async () => {
    const app = buildTestApp();
    const pack = await createPack(app);

    const first = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/framework/fields`,
      headers: authHeaders(),
      payload: { fieldKey: 'openLate', label: 'Open Late', dataType: 'boolean' },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/framework/fields`,
      headers: authHeaders(),
      payload: { fieldKey: 'Openlate', label: 'Open Late (alt)', dataType: 'boolean' },
    });
    expect(second.statusCode).toBe(201);
  });

  it('deletes a field definition without touching a POI custom_fields value stored under that key', async () => {
    const app = buildTestApp();
    const pack = await createPack(app);

    const fieldResponse = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/framework/fields`,
      headers: authHeaders(),
      payload: { fieldKey: 'open_late', label: 'Open Late', dataType: 'boolean' },
    });
    expect(fieldResponse.statusCode).toBe(201);
    const field = fieldResponse.json();

    const [poiType] = await testDb.insert(poiTypes).values({ slug: 'diner', name: 'Diner' }).returning();
    const customFields = { open_late: true };
    const [poi] = await testDb
      .insert(pois)
      .values({
        poiTypeId: poiType.id,
        name: 'Test Diner',
        addressStreet: '123 Main St',
        addressCity: 'Springfield',
        addressState: 'IL',
        addressZip: '62701',
        customFields,
      })
      .returning();

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/packs/${pack.id}/framework/fields/${field.id}`,
      headers: authHeaders(),
    });
    expect(deleteResponse.statusCode).toBe(204);

    const [reread] = await testDb.select().from(pois).where(eq(pois.id, poi.id));
    expect(reread.customFields).toEqual(customFields);
  });

  it('reorders field definitions via PUT sortOrder', async () => {
    const app = buildTestApp();
    const pack = await createPack(app);

    const keys = ['field_a', 'field_b', 'field_c'];
    const created: Array<{ id: string }> = [];
    for (const key of keys) {
      const response = await app.inject({
        method: 'POST',
        url: `/v1/admin/packs/${pack.id}/framework/fields`,
        headers: authHeaders(),
        payload: { fieldKey: key, label: key, dataType: 'text', sortOrder: created.length },
      });
      created.push(response.json());
    }

    // Reverse the order: field_c first, field_b second, field_a last.
    await app.inject({
      method: 'PUT',
      url: `/v1/admin/packs/${pack.id}/framework/fields/${created[0].id}`,
      headers: authHeaders(),
      payload: { sortOrder: 2 },
    });
    await app.inject({
      method: 'PUT',
      url: `/v1/admin/packs/${pack.id}/framework/fields/${created[2].id}`,
      headers: authHeaders(),
      payload: { sortOrder: 0 },
    });

    const list = await app.inject({
      method: 'GET',
      url: `/v1/admin/packs/${pack.id}/framework/fields`,
      headers: authHeaders(),
    });
    const orderedKeys = list.json().map((f: { fieldKey: string }) => f.fieldKey);
    expect(orderedKeys).toEqual(['field_c', 'field_b', 'field_a']);
  });

  it('returns 404 FIELD_NOT_FOUND when PUTting a field that does not exist', async () => {
    const app = buildTestApp();
    const pack = await createPack(app);

    const response = await app.inject({
      method: 'PUT',
      url: `/v1/admin/packs/${pack.id}/framework/fields/00000000-0000-0000-0000-000000000000`,
      headers: authHeaders(),
      payload: { label: 'Renamed' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('FIELD_NOT_FOUND');
  });

  it('returns an empty fields array for a pack with no field definitions', async () => {
    const app = buildTestApp();
    const pack = await createPack(app);

    const response = await app.inject({
      method: 'GET',
      url: `/v1/admin/packs/${pack.id}/framework/fields`,
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });
});
