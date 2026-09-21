import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { ADMIN_TOKEN_FOR_TESTS, buildTestApp, resetDb, testDb } from '../../../test/setup.js';
import { packFieldDefinitions } from '../../db/schema.js';

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
      headers: { authorization: `Bearer ${ADMIN_TOKEN_FOR_TESTS}` },
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
      headers: { authorization: `Bearer ${ADMIN_TOKEN_FOR_TESTS}` },
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
      headers: { authorization: `Bearer ${ADMIN_TOKEN_FOR_TESTS}` },
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
      headers: { authorization: `Bearer ${ADMIN_TOKEN_FOR_TESTS}` },
      payload: { fieldKey: 'is_open_24_hours', label: 'Open 24 Hours', dataType: 'boolean' },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/framework/fields`,
      headers: { authorization: `Bearer ${ADMIN_TOKEN_FOR_TESTS}` },
      payload: { fieldKey: 'is_open_24_hours', label: 'Open Late', dataType: 'boolean' },
    });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: 'FIELD_KEY_TAKEN' });
  });
});
