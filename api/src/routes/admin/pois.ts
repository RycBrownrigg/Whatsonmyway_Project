import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  packFieldDefinitions,
  packFilterDefinitions,
  packs,
  poiTypes,
  pois,
} from '../../db/schema.js';
import { geocodeAddress, normalizeAddressKey, type GeocodeCandidate } from '../../services/geocoding.js';
import { AppError } from '../../utils/errors.js';

export const CreatePoiSchema = z.object({
  poiTypeId: z.string().uuid(),
  name: z.string().min(1),
  addressStreet: z.string().min(1),
  addressCity: z.string().min(1),
  addressState: z.string().length(2),
  addressZip: z.string().min(1),
  phone: z.string().optional(),
  website: z.string().url().optional(),
  additionalInfo: z.string().optional(),
  customFields: z.record(z.string(), z.unknown()).default({}),
  filterValues: z.record(z.string(), z.unknown()).default({}),
});

// Every CreatePoiSchema field is optional here except poiTypeId, which is
// omitted entirely — moving a POI between types would silently change which
// pack builds include it (see this plan's <action> for PUT /:id).
export const UpdatePoiSchema = z.object({
  name: z.string().min(1).optional(),
  addressStreet: z.string().min(1).optional(),
  addressCity: z.string().min(1).optional(),
  addressState: z.string().length(2).optional(),
  addressZip: z.string().min(1).optional(),
  phone: z.string().optional(),
  website: z.string().url().optional(),
  additionalInfo: z.string().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  filterValues: z.record(z.string(), z.unknown()).optional(),
});

// An absent body means "re-run the provider" (explicit retry). A present
// body selects a stored candidate by index instead of calling the provider.
export const GeocodeActionSchema = z
  .object({
    selectedCandidateIndex: z.number().int().nonnegative(),
  })
  .optional();

const PoiListQuerySchema = z.object({
  poiTypeId: z.string().uuid().optional(),
  status: z.enum(['active', 'flagged', 'archived']).optional(),
});

type PoiAddress = {
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
};

function addressKeyFromRow(row: PoiAddress): string {
  return normalizeAddressKey({
    street: row.addressStreet,
    city: row.addressCity,
    state: row.addressState,
    zip: row.addressZip,
  });
}

type FieldDef = { dataType: string; enumOptions: unknown };
type FilterDef = { filterType: string; options: unknown };

// T-01-14 (threat model): customFields/filterValues object keys are bounded
// upstream by the fieldKey/filterKey regex (plan 01-02), but this route goes
// further and rejects any submitted key that isn't a saved field/filter
// definition for a pack built on this POI type — a key that's merely
// regex-legal but not one the admin actually defined is still rejected.
// Also returns each definition's dataType/filterType (+ enumOptions/options)
// so callers can validate submitted *values*, not just keys (WR-03).
async function findAllowedKeys(poiTypeId: string) {
  const relatedPacks = await db.select({ id: packs.id }).from(packs).where(eq(packs.poiTypeId, poiTypeId));
  if (relatedPacks.length === 0) {
    return {
      fieldKeys: new Set<string>(),
      filterKeys: new Set<string>(),
      fieldDefs: new Map<string, FieldDef>(),
      filterDefs: new Map<string, FilterDef>(),
    };
  }
  const packIds = relatedPacks.map((p) => p.id);

  const fieldRows = await db
    .select({
      fieldKey: packFieldDefinitions.fieldKey,
      dataType: packFieldDefinitions.dataType,
      enumOptions: packFieldDefinitions.enumOptions,
    })
    .from(packFieldDefinitions)
    .where(inArray(packFieldDefinitions.packId, packIds));
  const filterRows = await db
    .select({
      filterKey: packFilterDefinitions.filterKey,
      filterType: packFilterDefinitions.filterType,
      options: packFilterDefinitions.options,
    })
    .from(packFilterDefinitions)
    .where(inArray(packFilterDefinitions.packId, packIds));

  return {
    fieldKeys: new Set(fieldRows.map((r) => r.fieldKey)),
    filterKeys: new Set(filterRows.map((r) => r.filterKey)),
    fieldDefs: new Map(fieldRows.map((r) => [r.fieldKey, { dataType: r.dataType, enumOptions: r.enumOptions }])),
    filterDefs: new Map(filterRows.map((r) => [r.filterKey, { filterType: r.filterType, options: r.options }])),
  };
}

// WR-03: findAllowedKeys only bounded *keys* — a key matching a real
// definition could still carry a value of the wrong shape (a string where
// the field is `number`, an option not in an enum's declared list, etc.).
// packBuild.ts copies customFields/filterValues straight into the shipped
// pack file with no further check, so this is the last gate before that.
function validateFieldFilterValues(
  customFields: Record<string, unknown>,
  filterValues: Record<string, unknown>,
  fieldDefs: Map<string, FieldDef>,
  filterDefs: Map<string, FilterDef>,
): string[] {
  const errors: string[] = [];

  for (const [key, value] of Object.entries(customFields)) {
    const def = fieldDefs.get(key);
    if (!def) continue; // unknown-key check already rejected this elsewhere
    switch (def.dataType) {
      case 'number':
        if (typeof value !== 'number') errors.push(`${key}: expected a number`);
        break;
      case 'boolean':
        if (typeof value !== 'boolean') errors.push(`${key}: expected a boolean`);
        break;
      case 'url':
        if (typeof value !== 'string' || !z.string().url().safeParse(value).success) {
          errors.push(`${key}: expected a valid URL`);
        }
        break;
      case 'enum': {
        const options = Array.isArray(def.enumOptions) ? (def.enumOptions as unknown[]) : [];
        if (typeof value !== 'string' || !options.includes(value)) {
          errors.push(`${key}: expected one of the field's declared enumOptions`);
        }
        break;
      }
      case 'text':
      case 'phone':
      default:
        if (typeof value !== 'string') errors.push(`${key}: expected a string`);
        break;
    }
  }

  for (const [key, value] of Object.entries(filterValues)) {
    const def = filterDefs.get(key);
    if (!def) continue;
    switch (def.filterType) {
      case 'boolean':
        if (typeof value !== 'boolean') errors.push(`${key}: expected a boolean`);
        break;
      case 'single-select': {
        const options = Array.isArray(def.options) ? (def.options as unknown[]) : [];
        if (typeof value !== 'string' || !options.includes(value)) {
          errors.push(`${key}: expected one of the filter's declared options`);
        }
        break;
      }
      case 'multi-select': {
        const options = Array.isArray(def.options) ? (def.options as unknown[]) : [];
        if (!Array.isArray(value) || !value.every((v) => typeof v === 'string' && options.includes(v))) {
          errors.push(`${key}: expected an array of the filter's declared options`);
        }
        break;
      }
    }
  }

  return errors;
}

export async function registerPoiRoutes(fastify: FastifyInstance) {
  fastify.post('/v1/admin/pois', async (req, reply) => {
    const parsed = CreatePoiSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.status(400).send({ error: 'VALIDATION_FAILED', issues: parsed.error.flatten() });
      return;
    }

    const { poiTypeId, customFields, filterValues, ...rest } = parsed.data;

    const [poiType] = await db.select().from(poiTypes).where(eq(poiTypes.id, poiTypeId));
    if (!poiType) {
      reply.status(404).send({ error: 'POI_TYPE_NOT_FOUND' });
      return;
    }

    const { fieldKeys, filterKeys, fieldDefs, filterDefs } = await findAllowedKeys(poiTypeId);
    const unknownFieldKeys = Object.keys(customFields).filter((k) => !fieldKeys.has(k));
    const unknownFilterKeys = Object.keys(filterValues).filter((k) => !filterKeys.has(k));
    if (unknownFieldKeys.length > 0 || unknownFilterKeys.length > 0) {
      reply.status(400).send({
        error: 'UNKNOWN_FIELD_OR_FILTER_KEY',
        unknownFieldKeys,
        unknownFilterKeys,
      });
      return;
    }

    const valueErrors = validateFieldFilterValues(customFields, filterValues, fieldDefs, filterDefs);
    if (valueErrors.length > 0) {
      reply.status(400).send({ error: 'INVALID_FIELD_VALUE_TYPE', issues: valueErrors });
      return;
    }

    let geocodeResult;
    try {
      geocodeResult = await geocodeAddress({
        street: rest.addressStreet,
        city: rest.addressCity,
        state: rest.addressState,
        zip: rest.addressZip,
      });
    } catch (err) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ error: err.code, message: err.message });
        return;
      }
      throw err;
    }

    // UC-12 step 5: a failed or low-confidence geocode never fails the save —
    // the POI is stored and flagged for review instead.
    const [poi] = await db
      .insert(pois)
      .values({
        ...rest,
        poiTypeId,
        customFields,
        filterValues,
        latitude: geocodeResult.latitude,
        longitude: geocodeResult.longitude,
        geocodeStatus: geocodeResult.status,
        geocodeConfidence: geocodeResult.confidence,
        geocodeCandidates: geocodeResult.candidates,
        status: geocodeResult.status === 'ok' ? 'active' : 'flagged',
      })
      .returning();

    reply.status(201).send({ ...poi, geocodeErrorCode: geocodeResult.errorCode });
  });

  fastify.get('/v1/admin/pois', async (req, reply) => {
    const parsedQuery = PoiListQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      reply.status(400).send({ error: 'VALIDATION_FAILED', issues: parsedQuery.error.flatten() });
      return;
    }

    const { poiTypeId, status } = parsedQuery.data;
    const conditions = [
      poiTypeId ? eq(pois.poiTypeId, poiTypeId) : undefined,
      status ? eq(pois.status, status) : undefined,
    ].filter((c): c is NonNullable<typeof c> => c !== undefined);

    const rows = await db
      .select()
      .from(pois)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(pois.name));

    reply.status(200).send(rows);
  });

  // Not explicitly named in this plan's <action> mount list, but required by
  // it: the edit screen loads a single POI through `poiApi.get(id)`, and
  // there is no other way to fetch one row by id (Rule 2 — missing critical
  // functionality the edit form cannot work without).
  fastify.get<{ Params: { id: string } }>('/v1/admin/pois/:id', async (req, reply) => {
    const { id } = req.params;
    const [poi] = await db.select().from(pois).where(eq(pois.id, id));
    if (!poi) {
      reply.status(404).send({ error: 'POI_NOT_FOUND' });
      return;
    }
    reply.status(200).send(poi);
  });

  fastify.put<{ Params: { id: string } }>('/v1/admin/pois/:id', async (req, reply) => {
    const { id } = req.params;
    const parsed = UpdatePoiSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.status(400).send({ error: 'VALIDATION_FAILED', issues: parsed.error.flatten() });
      return;
    }

    const [existing] = await db.select().from(pois).where(eq(pois.id, id));
    if (!existing) {
      reply.status(404).send({ error: 'POI_NOT_FOUND' });
      return;
    }

    const patch = parsed.data;

    // Same defense-in-depth as the create path (T-01-14): a submitted
    // customFields/filterValues key must match a saved field/filter
    // definition for a pack built on this POI's type.
    if (patch.customFields || patch.filterValues) {
      const { fieldKeys, filterKeys, fieldDefs, filterDefs } = await findAllowedKeys(existing.poiTypeId);
      const unknownFieldKeys = Object.keys(patch.customFields ?? {}).filter((k) => !fieldKeys.has(k));
      const unknownFilterKeys = Object.keys(patch.filterValues ?? {}).filter((k) => !filterKeys.has(k));
      if (unknownFieldKeys.length > 0 || unknownFilterKeys.length > 0) {
        reply.status(400).send({
          error: 'UNKNOWN_FIELD_OR_FILTER_KEY',
          unknownFieldKeys,
          unknownFilterKeys,
        });
        return;
      }

      const valueErrors = validateFieldFilterValues(
        patch.customFields ?? {},
        patch.filterValues ?? {},
        fieldDefs,
        filterDefs,
      );
      if (valueErrors.length > 0) {
        reply.status(400).send({ error: 'INVALID_FIELD_VALUE_TYPE', issues: valueErrors });
        return;
      }
    }

    const mergedAddress: PoiAddress = {
      addressStreet: patch.addressStreet ?? existing.addressStreet,
      addressCity: patch.addressCity ?? existing.addressCity,
      addressState: patch.addressState ?? existing.addressState,
      addressZip: patch.addressZip ?? existing.addressZip,
    };

    const nonGeocodeUpdates: Record<string, unknown> = {};
    if (patch.name !== undefined) nonGeocodeUpdates.name = patch.name;
    if (patch.phone !== undefined) nonGeocodeUpdates.phone = patch.phone;
    if (patch.website !== undefined) nonGeocodeUpdates.website = patch.website;
    if (patch.additionalInfo !== undefined) nonGeocodeUpdates.additionalInfo = patch.additionalInfo;
    if (patch.customFields !== undefined) nonGeocodeUpdates.customFields = patch.customFields;
    if (patch.filterValues !== undefined) nonGeocodeUpdates.filterValues = patch.filterValues;

    const addressUnchanged = addressKeyFromRow(mergedAddress) === addressKeyFromRow(existing);

    if (addressUnchanged) {
      // §17: "re-imports or minor data refreshes don't re-bill" — skip the
      // provider entirely and carry every geocode column and `status`
      // through unchanged, so an unrelated edit (name/phone/website/custom
      // fields) can never quietly un-flag a POI.
      const [updated] = await db
        .update(pois)
        .set({ ...nonGeocodeUpdates, ...mergedAddress, updatedAt: new Date() })
        .where(eq(pois.id, id))
        .returning();

      reply.status(200).send({ ...updated, geocodeErrorCode: null });
      return;
    }

    let geocodeResult;
    try {
      geocodeResult = await geocodeAddress({
        street: mergedAddress.addressStreet,
        city: mergedAddress.addressCity,
        state: mergedAddress.addressState,
        zip: mergedAddress.addressZip,
      });
    } catch (err) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ error: err.code, message: err.message });
        return;
      }
      throw err;
    }

    const [updated] = await db
      .update(pois)
      .set({
        ...nonGeocodeUpdates,
        ...mergedAddress,
        latitude: geocodeResult.latitude,
        longitude: geocodeResult.longitude,
        geocodeStatus: geocodeResult.status,
        geocodeConfidence: geocodeResult.confidence,
        geocodeCandidates: geocodeResult.candidates,
        status: geocodeResult.status === 'ok' ? 'active' : 'flagged',
        updatedAt: new Date(),
      })
      .where(eq(pois.id, id))
      .returning();

    reply.status(200).send({ ...updated, geocodeErrorCode: geocodeResult.errorCode });
  });

  fastify.post<{ Params: { id: string } }>('/v1/admin/pois/:id/geocode', async (req, reply) => {
    const { id } = req.params;

    const [existing] = await db.select().from(pois).where(eq(pois.id, id));
    if (!existing) {
      reply.status(404).send({ error: 'POI_NOT_FOUND' });
      return;
    }

    const parsedBody = GeocodeActionSchema.safeParse(req.body ?? undefined);
    if (!parsedBody.success) {
      reply.status(400).send({ error: 'VALIDATION_FAILED', issues: parsedBody.error.flatten() });
      return;
    }

    if (parsedBody.data) {
      const { selectedCandidateIndex } = parsedBody.data;
      const storedCandidates = (existing.geocodeCandidates as GeocodeCandidate[] | null) ?? null;
      if (!storedCandidates || storedCandidates.length === 0) {
        reply.status(409).send({ error: 'NO_CANDIDATES_STORED' });
        return;
      }
      const candidate = storedCandidates[selectedCandidateIndex];
      if (!candidate) {
        reply.status(400).send({ error: 'CANDIDATE_INDEX_OUT_OF_RANGE' });
        return;
      }

      const latitude = Number(candidate.latitude);
      const longitude = Number(candidate.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        reply.status(400).send({ error: 'CANDIDATE_INDEX_OUT_OF_RANGE' });
        return;
      }

      // A human confirmed this candidate — no further provider call, and no
      // ambiguity remains once one is chosen.
      const [updated] = await db
        .update(pois)
        .set({
          latitude,
          longitude,
          geocodeStatus: 'ok',
          geocodeConfidence: 1.0,
          geocodeCandidates: null,
          status: 'active',
          updatedAt: new Date(),
        })
        .where(eq(pois.id, id))
        .returning();

      reply.status(200).send({ ...updated, geocodeErrorCode: null });
      return;
    }

    // No body: an explicit admin retry always reaches the provider, even
    // when the address is unchanged — the memo inside geocodeAddress is
    // bypassed for exactly this reason (see geocoding.ts).
    let geocodeResult;
    try {
      geocodeResult = await geocodeAddress(
        {
          street: existing.addressStreet,
          city: existing.addressCity,
          state: existing.addressState,
          zip: existing.addressZip,
        },
        { bypassMemo: true },
      );
    } catch (err) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ error: err.code, message: err.message });
        return;
      }
      throw err;
    }

    const [updated] = await db
      .update(pois)
      .set({
        latitude: geocodeResult.latitude,
        longitude: geocodeResult.longitude,
        geocodeStatus: geocodeResult.status,
        geocodeConfidence: geocodeResult.confidence,
        geocodeCandidates: geocodeResult.candidates,
        status: geocodeResult.status === 'ok' ? 'active' : 'flagged',
        updatedAt: new Date(),
      })
      .where(eq(pois.id, id))
      .returning();

    reply.status(200).send({ ...updated, geocodeErrorCode: geocodeResult.errorCode });
  });
}
