import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { packFieldDefinitions, packs } from '../../db/schema.js';

export const CreateFieldSchema = z.object({
  fieldKey: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  label: z.string().min(1),
  dataType: z.enum(['text', 'number', 'boolean', 'url', 'phone', 'enum']),
  enumOptions: z.array(z.string()).optional(),
  isRequired: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

const POSTGRES_UNIQUE_VIOLATION = '23505';

function isPostgresError(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === code;
}

export async function registerFieldRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string } }>(
    '/v1/admin/packs/:id/framework/fields',
    async (req, reply) => {
      const parsed = CreateFieldSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.status(400).send({ error: 'VALIDATION_FAILED', issues: parsed.error.flatten() });
        return;
      }

      const { id: packId } = req.params;
      const [pack] = await db.select().from(packs).where(eq(packs.id, packId));
      if (!pack) {
        reply.status(404).send({ error: 'PACK_NOT_FOUND' });
        return;
      }

      try {
        const [field] = await db
          .insert(packFieldDefinitions)
          .values({ ...parsed.data, packId })
          .returning();
        reply.status(201).send(field);
      } catch (err) {
        if (isPostgresError(err, POSTGRES_UNIQUE_VIOLATION)) {
          reply.status(409).send({ error: 'FIELD_KEY_TAKEN' });
          return;
        }
        throw err;
      }
    },
  );
}
