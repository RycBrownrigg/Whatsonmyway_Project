import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { packFilterDefinitions, packs } from '../../db/schema.js';

// Case-preserving: a leading letter (either case) then letters/digits/underscore.
// Uniqueness under unique(pack_id, filter_key) is exact-string, case-sensitive —
// this regex only bounds the character set, it never normalizes case, for the
// same JSONB-key safety reason as fields.ts's FIELD_KEY_REGEX.
const FILTER_KEY_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const FILTER_TYPES = ['boolean', 'single-select', 'multi-select'] as const;

function refineOptionsOnCreate(
  data: { filterType: (typeof FILTER_TYPES)[number]; options?: string[] | null },
  ctx: z.RefinementCtx,
) {
  if (data.filterType === 'single-select' || data.filterType === 'multi-select') {
    if (!data.options || data.options.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'single-select and multi-select filters require at least one option',
        path: ['options'],
      });
    }
  } else if (data.options != null && data.options.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'options is only valid for single-select and multi-select filters',
      path: ['options'],
    });
  }
}

export const CreateFilterSchema = z
  .object({
    filterKey: z.string().regex(FILTER_KEY_REGEX),
    label: z.string().min(1),
    filterType: z.enum(FILTER_TYPES),
    options: z.array(z.string()).optional().nullable(),
    sortOrder: z.number().int().default(0),
  })
  .superRefine(refineOptionsOnCreate);

export const UpdateFilterSchema = z
  .object({
    label: z.string().min(1).optional(),
    filterType: z.enum(FILTER_TYPES).optional(),
    options: z.array(z.string()).optional().nullable(),
    sortOrder: z.number().int().optional(),
  })
  .superRefine((data, ctx) => {
    const needsOptions = data.filterType === 'single-select' || data.filterType === 'multi-select';
    if (needsOptions && data.options !== undefined) {
      if (!data.options || data.options.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'single-select and multi-select filters require at least one option',
          path: ['options'],
        });
      }
    } else if (
      data.filterType === 'boolean' &&
      data.options != null &&
      data.options.length > 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'options is only valid for single-select and multi-select filters',
        path: ['options'],
      });
    }
  });

const POSTGRES_UNIQUE_VIOLATION = '23505';

function isPostgresError(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === code;
}

export async function registerFilterRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string } }>(
    '/v1/admin/packs/:id/framework/filters',
    async (req, reply) => {
      const parsed = CreateFilterSchema.safeParse(req.body);
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
        const [filter] = await db
          .insert(packFilterDefinitions)
          .values({ ...parsed.data, packId })
          .returning();
        reply.status(201).send(filter);
      } catch (err) {
        if (isPostgresError(err, POSTGRES_UNIQUE_VIOLATION)) {
          reply.status(409).send({ error: 'FILTER_KEY_TAKEN' });
          return;
        }
        throw err;
      }
    },
  );

  fastify.get<{ Params: { id: string } }>(
    '/v1/admin/packs/:id/framework/filters',
    async (req, reply) => {
      const { id: packId } = req.params;
      const [pack] = await db.select().from(packs).where(eq(packs.id, packId));
      if (!pack) {
        reply.status(404).send({ error: 'PACK_NOT_FOUND' });
        return;
      }

      const filters = await db
        .select()
        .from(packFilterDefinitions)
        .where(eq(packFilterDefinitions.packId, packId))
        .orderBy(packFilterDefinitions.sortOrder, packFilterDefinitions.filterKey);

      reply.status(200).send(filters);
    },
  );

  fastify.put<{ Params: { id: string; filterId: string } }>(
    '/v1/admin/packs/:id/framework/filters/:filterId',
    async (req, reply) => {
      const parsed = UpdateFilterSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.status(400).send({ error: 'VALIDATION_FAILED', issues: parsed.error.flatten() });
        return;
      }

      const { id: packId, filterId } = req.params;
      const [existing] = await db
        .select()
        .from(packFilterDefinitions)
        .where(and(eq(packFilterDefinitions.id, filterId), eq(packFilterDefinitions.packId, packId)));
      if (!existing) {
        reply.status(404).send({ error: 'FILTER_NOT_FOUND' });
        return;
      }

      const [updated] = await db
        .update(packFilterDefinitions)
        .set(parsed.data)
        .where(eq(packFilterDefinitions.id, filterId))
        .returning();
      reply.status(200).send(updated);
    },
  );

  fastify.delete<{ Params: { id: string; filterId: string } }>(
    '/v1/admin/packs/:id/framework/filters/:filterId',
    async (req, reply) => {
      const { id: packId, filterId } = req.params;
      const [existing] = await db
        .select()
        .from(packFilterDefinitions)
        .where(and(eq(packFilterDefinitions.id, filterId), eq(packFilterDefinitions.packId, packId)));
      if (!existing) {
        reply.status(404).send({ error: 'FILTER_NOT_FOUND' });
        return;
      }

      // Deletes only the definition row. pois.filter_values is never touched here —
      // stored values under this key survive so re-adding the filter restores them.
      await db.delete(packFilterDefinitions).where(eq(packFilterDefinitions.id, filterId));
      reply.status(204).send();
    },
  );
}
