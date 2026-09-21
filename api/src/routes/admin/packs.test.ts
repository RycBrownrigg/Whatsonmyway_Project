import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN_TOKEN_FOR_TESTS, buildTestApp, resetDb } from '../../../test/setup.js';

describe('admin packs — end-to-end tracer', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('creates a pack over HTTP and reads it back from GET /v1/admin/packs', async () => {
    const app = buildTestApp();

    const createResponse = await app.inject({
      method: 'POST',
      url: '/v1/admin/packs',
      headers: { authorization: `Bearer ${ADMIN_TOKEN_FOR_TESTS}` },
      payload: {
        name: 'Waffle House Locations',
        slug: 'waffle-house',
        packType: 'standard',
        appleProductId: 'com.wowm.pack.waffle-house',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();
    expect(created.slug).toBe('waffle-house');

    const listResponse = await app.inject({
      method: 'GET',
      url: '/v1/admin/packs',
      headers: { authorization: `Bearer ${ADMIN_TOKEN_FOR_TESTS}` },
    });

    expect(listResponse.statusCode).toBe(200);
    const packsList = listResponse.json();
    expect(packsList.some((pack: { id: string }) => pack.id === created.id)).toBe(true);
  });
});

describe('admin auth boundary', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('returns 401 with no Authorization header', async () => {
    const app = buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/v1/admin/packs' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 for the right value with the wrong scheme', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/v1/admin/packs',
      headers: { authorization: `Token ${ADMIN_TOKEN_FOR_TESTS}` },
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 403 with a wrong bearer token', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/v1/admin/packs',
      headers: { authorization: 'Bearer totally-wrong-token' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns 403 for a correct token that is one character short', async () => {
    const app = buildTestApp();
    const truncated = ADMIN_TOKEN_FOR_TESTS.slice(0, -1);
    const response = await app.inject({
      method: 'GET',
      url: '/v1/admin/packs',
      headers: { authorization: `Bearer ${truncated}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it('leaves /healthz open with no Authorization header', async () => {
    const app = buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
  });

  it('returns 500 rather than allowing the request through when ADMIN_API_TOKEN is unset', async () => {
    const app = buildTestApp();
    const previousToken = process.env.ADMIN_API_TOKEN;
    delete process.env.ADMIN_API_TOKEN;

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/admin/packs',
        headers: { authorization: `Bearer ${ADMIN_TOKEN_FOR_TESTS}` },
      });
      expect(response.statusCode).toBe(500);
    } finally {
      process.env.ADMIN_API_TOKEN = previousToken;
    }
  });
});
