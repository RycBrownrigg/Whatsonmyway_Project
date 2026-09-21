import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { asc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { poiTypes } from '../../db/schema.js';

// Mirrors packs.ts's slug regex — same "lowercase, digits, hyphens" contract.
const POI_TYPE_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,62}$/;

export const CreatePoiTypeSchema = z.object({
  slug: z.string().regex(POI_TYPE_SLUG_REGEX),
  name: z.string().min(1),
});

const POSTGRES_UNIQUE_VIOLATION = '23505';

function isPostgresError(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === code;
}

export async function registerPoiTypeRoutes(fastify: FastifyInstance) {
  fastify.post('/v1/admin/poi-types', async (req, reply) => {
    const parsed = CreatePoiTypeSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.status(400).send({ error: 'VALIDATION_FAILED', issues: parsed.error.flatten() });
      return;
    }

    try {
      const [poiType] = await db.insert(poiTypes).values(parsed.data).returning();
      reply.status(201).send(poiType);
    } catch (err) {
      if (isPostgresError(err, POSTGRES_UNIQUE_VIOLATION)) {
        reply.status(409).send({ error: 'POI_TYPE_SLUG_TAKEN' });
        return;
      }
      throw err;
    }
  });

  fastify.get('/v1/admin/poi-types', async (_req, reply) => {
    const rows = await db.select().from(poiTypes).orderBy(asc(poiTypes.name));
    reply.status(200).send(rows);
  });
}
