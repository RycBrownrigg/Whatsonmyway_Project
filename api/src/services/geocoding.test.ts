import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { geocodeAddress, normalizeAddressKey } from './geocoding.js';

const ADDRESS = { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701' };

function fakeResponse(ok: boolean, body: unknown): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

function candidate(overrides: {
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
    analysis: {
      dpv_match_code: overrides.dpvMatchCode ?? 'Y',
    },
  };
}

describe('geocoding service (§15/§17)', () => {
  beforeEach(() => {
    vi.stubEnv('SMARTY_AUTH_ID', 'test-auth-id');
    vi.stubEnv('SMARTY_AUTH_TOKEN', 'test-auth-token');
    vi.stubEnv('GEOCODE_CONFIDENCE_THRESHOLD', '0.7');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('normalizeAddressKey', () => {
    it('produces the same key for two spellings of the same address', () => {
      const a = normalizeAddressKey({ street: '123 Main St.', city: 'Springfield', state: 'IL', zip: '62701' });
      const b = normalizeAddressKey({ street: '123   main st', city: 'SPRINGFIELD', state: 'il', zip: '62701' });
      expect(a).toBe(b);
      expect(a).toBe('123 main st springfield il 62701');
    });
  });

  describe('geocodeAddress', () => {
    it('throws AppError naming the missing variable when SMARTY_AUTH_ID is unset', async () => {
      vi.stubEnv('SMARTY_AUTH_ID', '');
      await expect(geocodeAddress(ADDRESS)).rejects.toMatchObject({
        code: 'GEOCODING_CONFIG_MISSING',
      });
    });

    it('returns failed/ADDRESS_NOT_FOUND with null coordinates for zero candidates', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse(true, []));

      const result = await geocodeAddress(ADDRESS);

      expect(result.status).toBe('failed');
      expect(result.errorCode).toBe('ADDRESS_NOT_FOUND');
      expect(result.latitude).toBeNull();
      expect(result.longitude).toBeNull();
      expect(result.confidence).toBeNull();
    });

    it('returns low_confidence/ADDRESS_AMBIGUOUS with null coordinates and every candidate stored for 2+ matches', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        fakeResponse(true, [candidate({}), candidate({ latitude: 40.1, longitude: -90.1 })]),
      );

      const result = await geocodeAddress(ADDRESS);

      expect(result.status).toBe('low_confidence');
      expect(result.errorCode).toBe('ADDRESS_AMBIGUOUS');
      expect(result.latitude).toBeNull();
      expect(result.longitude).toBeNull();
      expect(result.candidates).toHaveLength(2);
    });

    it('scores a Y match at rooftop-grade precision as confidence 1.0 and status ok', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        fakeResponse(true, [candidate({ dpvMatchCode: 'Y', precision: 'Zip9' })]),
      );

      const result = await geocodeAddress(ADDRESS);

      expect(result.status).toBe('ok');
      expect(result.confidence).toBe(1.0);
      expect(result.latitude).not.toBeNull();
      expect(result.longitude).not.toBeNull();
      expect(result.errorCode).toBeNull();
    });

    it('treats a confidence exactly equal to the threshold as ok (inclusive boundary)', async () => {
      // dpv S/D scores 0.5 in this adapter's bucketing — set the threshold to
      // 0.5 so this single candidate lands exactly on the boundary.
      vi.stubEnv('GEOCODE_CONFIDENCE_THRESHOLD', '0.5');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        fakeResponse(true, [candidate({ dpvMatchCode: 'S', precision: 'Zip6' })]),
      );

      const result = await geocodeAddress(ADDRESS);

      expect(result.confidence).toBe(0.5);
      expect(result.status).toBe('ok');
    });

    it('scores a below-threshold single match as low_confidence/LOW_CONFIDENCE_MATCH but still stores coordinates', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        fakeResponse(true, [candidate({ dpvMatchCode: 'S', precision: 'Zip6' })]),
      );

      const result = await geocodeAddress(ADDRESS);

      expect(result.confidence).toBe(0.5);
      expect(result.status).toBe('low_confidence');
      expect(result.errorCode).toBe('LOW_CONFIDENCE_MATCH');
      expect(result.latitude).not.toBeNull();
      expect(result.longitude).not.toBeNull();
    });

    it('scores a dpv_match_code N as failed/ADDRESS_NOT_FOUND with null coordinates', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        fakeResponse(true, [candidate({ dpvMatchCode: 'N', precision: 'Zip5' })]),
      );

      const result = await geocodeAddress(ADDRESS);

      expect(result.status).toBe('failed');
      expect(result.errorCode).toBe('ADDRESS_NOT_FOUND');
      expect(result.latitude).toBeNull();
      expect(result.longitude).toBeNull();
    });

    it('retries a non-2xx response twice with backoff, then returns PROVIDER_ERROR with null coordinates', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse(false, {}));

      const result = await geocodeAddress(ADDRESS);

      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(result.status).toBe('failed');
      expect(result.errorCode).toBe('PROVIDER_ERROR');
      expect(result.latitude).toBeNull();
      expect(result.longitude).toBeNull();
    }, 10000);

    it('treats a malformed payload (missing metadata, non-numeric latitude) as PROVIDER_ERROR, never a coordinate', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        fakeResponse(true, [{ analysis: { dpv_match_code: 'Y' }, metadata: { latitude: 'oops' } }]),
      );

      const result = await geocodeAddress(ADDRESS);

      expect(result.status).toBe('failed');
      expect(result.errorCode).toBe('PROVIDER_ERROR');
      expect(result.latitude).toBeNull();
      expect(result.longitude).toBeNull();
      expect(typeof result.latitude).not.toBe('number');
    }, 10000);
  });
});
