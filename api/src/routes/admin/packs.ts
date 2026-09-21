import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { packFieldDefinitions, packFilterDefinitions, packs } from '../../db/schema.js';

export const CreatePackSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  description: z.string().optional(),
  packType: z.enum(['standard', 'state']),
  poiTypeId: z.string().uuid().optional(),
  stateCode: z.string().length(2).optional(),
  appleProductId: z.string().min(1),
  priceTier: z.string().optional(),
});

const POSTGRES_UNIQUE_VIOLATION = '23505';

function isPostgresError(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === code;
}

export async function registerPackRoutes(fastify: FastifyInstance) {
  fastify.post('/v1/admin/packs', async (req, reply) => {
    const parsed = CreatePackSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.status(400).send({ error: 'VALIDATION_FAILED', issues: parsed.error.flatten() });
      return;
    }

    try {
      const [pack] = await db.insert(packs).values(parsed.data).returning();
      reply.status(201).send(pack);
    } catch (err) {
      if (isPostgresError(err, POSTGRES_UNIQUE_VIOLATION)) {
        reply.status(409).send({ error: 'SLUG_OR_PRODUCT_ID_TAKEN' });
        return;
      }
      throw err;
    }
  });

  fastify.get('/v1/admin/packs', async (_req, reply) => {
    const rows = await db.select().from(packs).orderBy(desc(packs.createdAt));
    reply.status(200).send(rows);
  });

  fastify.get<{ Params: { id: string } }>('/v1/admin/packs/:id', async (req, reply) => {
    const { id } = req.params;
    const [pack] = await db.select().from(packs).where(eq(packs.id, id));
    if (!pack) {
      reply.status(404).send({ error: 'PACK_NOT_FOUND' });
      return;
    }

    const fields = await db
      .select()
      .from(packFieldDefinitions)
      .where(eq(packFieldDefinitions.packId, id))
      .orderBy(packFieldDefinitions.sortOrder, packFieldDefinitions.fieldKey);

    const filters = await db
      .select()
      .from(packFilterDefinitions)
      .where(eq(packFilterDefinitions.packId, id))
      .orderBy(packFilterDefinitions.sortOrder, packFilterDefinitions.filterKey);

    reply.status(200).send({ pack, fields, filters });
  });
}
