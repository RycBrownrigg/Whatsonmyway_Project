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
import { geocodeAddress } from '../../services/geocoding.js';
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

const PoiListQuerySchema = z.object({
  poiTypeId: z.string().uuid().optional(),
  status: z.enum(['active', 'flagged', 'archived']).optional(),
});

// T-01-14 (threat model): customFields/filterValues object keys are bounded
// upstream by the fieldKey/filterKey regex (plan 01-02), but this route goes
// further and rejects any submitted key that isn't a saved field/filter
// definition for a pack built on this POI type — a key that's merely
// regex-legal but not one the admin actually defined is still rejected.
async function findAllowedKeys(poiTypeId: string) {
  const relatedPacks = await db.select({ id: packs.id }).from(packs).where(eq(packs.poiTypeId, poiTypeId));
  if (relatedPacks.length === 0) {
    return { fieldKeys: new Set<string>(), filterKeys: new Set<string>() };
  }
  const packIds = relatedPacks.map((p) => p.id);

  const fieldRows = await db
    .select({ fieldKey: packFieldDefinitions.fieldKey })
    .from(packFieldDefinitions)
    .where(inArray(packFieldDefinitions.packId, packIds));
  const filterRows = await db
    .select({ filterKey: packFilterDefinitions.filterKey })
    .from(packFilterDefinitions)
    .where(inArray(packFilterDefinitions.packId, packIds));

  return {
    fieldKeys: new Set(fieldRows.map((r) => r.fieldKey)),
    filterKeys: new Set(filterRows.map((r) => r.filterKey)),
  };
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

    const { fieldKeys, filterKeys } = await findAllowedKeys(poiTypeId);
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
}
