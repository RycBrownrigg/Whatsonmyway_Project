import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { ADMIN_TOKEN_FOR_TESTS, buildTestApp, resetDb, testDb } from '../../test/setup.js';
import {
  packFieldDefinitions,
  packPois,
  packVersions,
  packs,
  poiTypes,
  pois,
} from '../db/schema.js';
import { AppError } from '../utils/errors.js';
import { buildStandardPack, validateRequiredFields } from './packBuild.js';

function authHeaders() {
  return { authorization: `Bearer ${ADMIN_TOKEN_FOR_TESTS}` };
}

async function seedPoiType(overrides: { slug?: string; name?: string } = {}) {
  const [poiType] = await testDb
    .insert(poiTypes)
    .values({ slug: overrides.slug ?? 'diner', name: overrides.name ?? 'Diner' })
    .returning();
  return poiType;
}

async function seedStandardPack(poiTypeId: string | null, overrides: Record<string, unknown> = {}) {
  const [pack] = await testDb
    .insert(packs)
    .values({
      slug: 'roadside-attractions',
      name: 'Roadside Attractions',
      packType: 'standard',
      poiTypeId,
      appleProductId: 'com.wowm.pack.roadside-attractions',
      ...overrides,
    })
    .returning();
  return pack;
}

async function seedPoi(poiTypeId: string, overrides: Record<string, unknown> = {}) {
  const [poi] = await testDb
    .insert(pois)
    .values({
      poiTypeId,
      name: 'Test POI',
      addressStreet: '123 Main St',
      addressCity: 'Springfield',
      addressState: 'IL',
      addressZip: '62701',
      geocodeStatus: 'ok',
      status: 'active',
      customFields: {},
      filterValues: {},
      ...overrides,
    })
    .returning();
  return poi;
}

async function seedField(packId: string, fieldKey: string, overrides: Record<string, unknown> = {}) {
  const [field] = await testDb
    .insert(packFieldDefinitions)
    .values({
      packId,
      fieldKey,
      label: fieldKey,
      dataType: 'text',
      isRequired: false,
      sortOrder: 0,
      ...overrides,
    })
    .returning();
  return field;
}

describe('validateRequiredFields (pure helper)', () => {
  it('returns no entries when there are no required fields', () => {
    const report = validateRequiredFields(
      [{ fieldKey: 'notes', isRequired: false }],
      [{ id: '1', name: 'A', customFields: {} }],
    );
    expect(report).toEqual([]);
  });

  it('reports a POI missing a value for a required field — null, undefined, and empty string all count as missing', () => {
    const fields = [{ fieldKey: 'hours', isRequired: true }];
    const report = validateRequiredFields(fields, [
      { id: 'a', name: 'Null value', customFields: { hours: null } },
      { id: 'b', name: 'Missing key', customFields: {} },
      { id: 'c', name: 'Empty string', customFields: { hours: '' } },
      { id: 'd', name: 'Present value', customFields: { hours: '9-5' } },
    ]);
    expect(report.map((r) => r.poiId)).toEqual(['a', 'b', 'c']);
    expect(report.every((r) => r.missingFieldKeys.includes('hours'))).toBe(true);
  });

  it('lists every missing field on a POI with more than one, and does not cap or truncate the overall report', () => {
    const fields = [
      { fieldKey: 'hours', isRequired: true },
      { fieldKey: 'capacity', isRequired: true },
      { fieldKey: 'notes', isRequired: false },
    ];
    const report = validateRequiredFields(fields, [
      { id: 'a', name: 'Missing both', customFields: {} },
      { id: 'b', name: 'Missing one', customFields: { hours: '9-5' } },
      { id: 'c', name: 'Missing the other', customFields: { capacity: '10' } },
    ]);
    expect(report).toHaveLength(3);
    const byId = Object.fromEntries(report.map((r) => [r.poiId, r.missingFieldKeys]));
    expect(byId.a.sort()).toEqual(['capacity', 'hours']);
    expect(byId.b).toEqual(['capacity']);
    expect(byId.c).toEqual(['hours']);
  });
});

describe('buildStandardPack (ADMINBUILD-01)', () => {
  let packFileDir: string;

  beforeEach(async () => {
    await resetDb();
    packFileDir = mkdtempSync(path.join(tmpdir(), 'wowm-packfiles-'));
    vi.stubEnv('PACK_FILE_DIR', packFileDir);
  });

  it('builds a pack with three eligible POIs into poi_count 3 and exactly three pack_pois rows', async () => {
    const poiType = await seedPoiType();
    const pack = await seedStandardPack(poiType.id);
    const poi1 = await seedPoi(poiType.id, { name: 'Alpha' });
    const poi2 = await seedPoi(poiType.id, { name: 'Bravo' });
    const poi3 = await seedPoi(poiType.id, { name: 'Charlie' });

    const result = await buildStandardPack(pack.id);

    expect(result.version).toBe(1);
    expect(result.poiCount).toBe(3);
    expect(result.checksum).toMatch(/^[0-9a-f]{64}$/);

    const snapshot = await testDb.select().from(packPois).where(eq(packPois.packId, pack.id));
    expect(snapshot).toHaveLength(3);
    const snapshotIds = snapshot.map((r) => r.poiId).sort();
    expect(snapshotIds).toEqual([poi1.id, poi2.id, poi3.id].sort());
  });

  it('excludes POIs with geocode_status failed or low_confidence, and POIs with status flagged or archived, even when the type matches', async () => {
    const poiType = await seedPoiType();
    const pack = await seedStandardPack(poiType.id);
    const eligible = await seedPoi(poiType.id, { name: 'Eligible' });
    await seedPoi(poiType.id, { name: 'Failed geocode', geocodeStatus: 'failed', status: 'flagged' });
    await seedPoi(poiType.id, { name: 'Low confidence', geocodeStatus: 'low_confidence', status: 'flagged' });
    await seedPoi(poiType.id, { name: 'Flagged despite ok geocode', geocodeStatus: 'ok', status: 'flagged' });
    await seedPoi(poiType.id, { name: 'Archived despite ok geocode', geocodeStatus: 'ok', status: 'archived' });

    const result = await buildStandardPack(pack.id);

    expect(result.poiCount).toBe(1);
    const snapshot = await testDb.select().from(packPois).where(eq(packPois.packId, pack.id));
    expect(snapshot.map((r) => r.poiId)).toEqual([eligible.id]);
  });

  it('excludes a POI of a different POI type', async () => {
    const diner = await seedPoiType({ slug: 'diner', name: 'Diner' });
    const park = await seedPoiType({ slug: 'park', name: 'Park' });
    const pack = await seedStandardPack(diner.id);
    const dinerPoi = await seedPoi(diner.id, { name: 'Diner POI' });
    await seedPoi(park.id, { name: 'Park POI' });

    const result = await buildStandardPack(pack.id);

    expect(result.poiCount).toBe(1);
    const snapshot = await testDb.select().from(packPois).where(eq(packPois.packId, pack.id));
    expect(snapshot.map((r) => r.poiId)).toEqual([dinerPoi.id]);
  });

  it('fails with 422 MISSING_REQUIRED_FIELDS, creates no pack_versions row, and leaves pack_pois untouched when a required field is missing (TC-27)', async () => {
    const poiType = await seedPoiType();
    const pack = await seedStandardPack(poiType.id);
    await seedField(pack.id, 'hours', { isRequired: true });
    await seedPoi(poiType.id, { name: 'Missing hours', customFields: {} });

    let caught: AppError | undefined;
    try {
      await buildStandardPack(pack.id);
    } catch (err) {
      caught = err as AppError;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect(caught?.statusCode).toBe(422);
    expect(caught?.code).toBe('MISSING_REQUIRED_FIELDS');
    expect(caught?.details).toEqual([
      { poiId: expect.any(String), poiName: 'Missing hours', missingFieldKeys: ['hours'] },
    ]);

    const versions = await testDb.select().from(packVersions).where(eq(packVersions.packId, pack.id));
    expect(versions).toHaveLength(0);
    const snapshot = await testDb.select().from(packPois).where(eq(packPois.packId, pack.id));
    expect(snapshot).toHaveLength(0);
  });

  it('reports all three entries when three POIs are each missing a different required field — nothing truncated', async () => {
    const poiType = await seedPoiType();
    const pack = await seedStandardPack(poiType.id);
    await seedField(pack.id, 'hours', { isRequired: true });
    await seedField(pack.id, 'capacity', { isRequired: true });
    await seedField(pack.id, 'website_note', { isRequired: true });
    await seedPoi(poiType.id, { name: 'Missing hours', customFields: { capacity: '10', website_note: 'n/a' } });
    await seedPoi(poiType.id, { name: 'Missing capacity', customFields: { hours: '9-5', website_note: 'n/a' } });
    await seedPoi(poiType.id, { name: 'Missing website_note', customFields: { hours: '9-5', capacity: '10' } });

    let caught: AppError | undefined;
    try {
      await buildStandardPack(pack.id);
    } catch (err) {
      caught = err as AppError;
    }

    expect(caught?.code).toBe('MISSING_REQUIRED_FIELDS');
    const report = caught?.details as Array<{ poiName: string; missingFieldKeys: string[] }>;
    expect(report).toHaveLength(3);
    expect(report.map((r) => r.poiName).sort()).toEqual(
      ['Missing capacity', 'Missing hours', 'Missing website_note'].sort(),
    );
  });

  it('rejects a zero-eligible-POI build with the exact message and creates no pack_versions row', async () => {
    const poiType = await seedPoiType();
    const pack = await seedStandardPack(poiType.id);

    let caught: AppError | undefined;
    try {
      await buildStandardPack(pack.id);
    } catch (err) {
      caught = err as AppError;
    }

    expect(caught?.statusCode).toBe(400);
    expect(caught?.code).toBe('PACK_HAS_NO_ELIGIBLE_POIS');
    expect(caught?.message).toBe('This pack has no geocoded POIs yet. Add or fix POIs before building.');

    const versions = await testDb.select().from(packVersions).where(eq(packVersions.packId, pack.id));
    expect(versions).toHaveLength(0);
  });

  it('produces version 2 with poi_count one higher after adding one eligible POI, and the new id is present in the snapshot (TC-28)', async () => {
    const poiType = await seedPoiType();
    const pack = await seedStandardPack(poiType.id);
    await seedPoi(poiType.id, { name: 'First' });
    await seedPoi(poiType.id, { name: 'Second' });

    const first = await buildStandardPack(pack.id);
    expect(first.version).toBe(1);
    expect(first.poiCount).toBe(2);

    const added = await seedPoi(poiType.id, { name: 'Third' });
    const second = await buildStandardPack(pack.id);

    expect(second.version).toBe(2);
    expect(second.poiCount).toBe(3);

    const snapshot = await testDb.select().from(packPois).where(eq(packPois.packId, pack.id));
    expect(snapshot.map((r) => r.poiId)).toContain(added.id);
    expect(snapshot).toHaveLength(3);
  });

  it('orders the pois array in the generated file ascending by id, and building identical data twice produces identical checksums', async () => {
    const poiType = await seedPoiType();
    const pack = await seedStandardPack(poiType.id);
    const poiA = await seedPoi(poiType.id, { name: 'Alpha' });
    const poiB = await seedPoi(poiType.id, { name: 'Bravo' });
    const poiC = await seedPoi(poiType.id, { name: 'Charlie' });

    const first = await buildStandardPack(pack.id);

    const filePath = path.join(packFileDir, pack.slug, `v${first.version}.json.gz`);
    const gzipped = readFileSync(filePath);
    const document = JSON.parse(gunzipSync(gzipped).toString('utf8'));
    const expectedIdsAscending = [poiA.id, poiB.id, poiC.id].sort();
    expect(document.pois.map((p: { id: string }) => p.id)).toEqual(expectedIdsAscending);

    // Reset the version counter so a second build computes the same version
    // number and the same content, isolating the reproducibility property
    // from the (deliberately incrementing) version cut.
    await testDb.delete(packVersions).where(eq(packVersions.packId, pack.id));

    const second = await buildStandardPack(pack.id);
    expect(second.version).toBe(first.version);
    expect(second.checksum).toBe(first.checksum);
  });

  it('leaves packs.status exactly as it was after a successful build', async () => {
    const poiType = await seedPoiType();
    const pack = await seedStandardPack(poiType.id, { status: 'draft' });
    await seedPoi(poiType.id);

    await buildStandardPack(pack.id);

    const [reread] = await testDb.select().from(packs).where(eq(packs.id, pack.id));
    expect(reread.status).toBe('draft');
    expect(reread.currentVersion).toBe(1);
  });

  it('leaves the previous pack_versions row and pack_pois snapshot intact after a subsequent failed build', async () => {
    const poiType = await seedPoiType();
    const pack = await seedStandardPack(poiType.id);
    const goodPoi = await seedPoi(poiType.id, { name: 'Good' });

    const first = await buildStandardPack(pack.id);
    expect(first.version).toBe(1);

    // Now make the pack framework require a field the existing POI lacks —
    // the next build must fail without disturbing what's already built.
    await seedField(pack.id, 'hours', { isRequired: true });

    await expect(buildStandardPack(pack.id)).rejects.toMatchObject({ code: 'MISSING_REQUIRED_FIELDS' });

    const versions = await testDb.select().from(packVersions).where(eq(packVersions.packId, pack.id));
    expect(versions).toHaveLength(1);
    expect(versions[0].version).toBe(1);

    const snapshot = await testDb.select().from(packPois).where(eq(packPois.packId, pack.id));
    expect(snapshot.map((r) => r.poiId)).toEqual([goodPoi.id]);
  });

  it('rejects a build for a state pack with 400 STATE_PACK_BUILD_NOT_SUPPORTED', async () => {
    const poiType = await seedPoiType();
    const pack = await seedStandardPack(poiType.id, {
      packType: 'state',
      slug: 'illinois-state-pack',
      appleProductId: 'com.wowm.pack.illinois-state-pack',
      stateCode: 'IL',
    });

    await expect(buildStandardPack(pack.id)).rejects.toMatchObject({
      statusCode: 400,
      code: 'STATE_PACK_BUILD_NOT_SUPPORTED',
    });
  });

  it('returns 404 PACK_NOT_FOUND for an unknown pack id', async () => {
    await expect(buildStandardPack('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({
      statusCode: 404,
      code: 'PACK_NOT_FOUND',
    });
  });
});

describe('POST /v1/admin/packs/:id/build (route wrapper)', () => {
  let packFileDir: string;

  beforeEach(async () => {
    await resetDb();
    packFileDir = mkdtempSync(path.join(tmpdir(), 'wowm-packfiles-'));
    vi.stubEnv('PACK_FILE_DIR', packFileDir);
  });

  it('replies 201 with the PackBuildResult on a successful build', async () => {
    const app = buildTestApp();
    const poiType = await seedPoiType();
    const pack = await seedStandardPack(poiType.id);
    await seedPoi(poiType.id);

    const response = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/build`,
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({ version: 1, poiCount: 1 });
    expect(body.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('replies 422 with the full missing-field report', async () => {
    const app = buildTestApp();
    const poiType = await seedPoiType();
    const pack = await seedStandardPack(poiType.id);
    await seedField(pack.id, 'hours', { isRequired: true });
    await seedPoi(poiType.id, { name: 'Missing hours' });

    const response = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/build`,
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(422);
    const body = response.json();
    expect(body.error).toBe('MISSING_REQUIRED_FIELDS');
    expect(body.report).toEqual([
      { poiId: expect.any(String), poiName: 'Missing hours', missingFieldKeys: ['hours'] },
    ]);
  });

  it('replies 400 with the exact zero-eligible-POI message and no report key', async () => {
    const app = buildTestApp();
    const poiType = await seedPoiType();
    const pack = await seedStandardPack(poiType.id);

    const response = await app.inject({
      method: 'POST',
      url: `/v1/admin/packs/${pack.id}/build`,
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('PACK_HAS_NO_ELIGIBLE_POIS');
    expect(body.message).toBe('This pack has no geocoded POIs yet. Add or fix POIs before building.');
    expect(body.report).toBeUndefined();
  });
});
