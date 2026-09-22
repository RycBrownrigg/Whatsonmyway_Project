import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { packFieldDefinitions, packs } from '../../db/schema.js';

// Case-preserving: a leading letter (either case) then letters/digits/underscore.
// Deliberately NOT case-insensitive at the *uniqueness* layer — Postgres `text`
// equality under unique(pack_id, field_key) treats "openLate" and "Openlate" as
// distinct keys. The regex only bounds the character set, never normalizes case.
const FIELD_KEY_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const DATA_TYPES = ['text', 'number', 'boolean', 'url', 'phone', 'enum'] as const;

function refineEnumOptionsOnCreate(
  data: { dataType: (typeof DATA_TYPES)[number]; enumOptions?: string[] | null },
  ctx: z.RefinementCtx,
) {
  if (data.dataType === 'enum') {
    if (!data.enumOptions || data.enumOptions.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'enum fields require at least one enumOptions value',
        path: ['enumOptions'],
      });
    }
  } else if (data.enumOptions != null && data.enumOptions.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'enumOptions is only valid when dataType is enum',
      path: ['enumOptions'],
    });
  }
}

export const CreateFieldSchema = z
  .object({
    fieldKey: z.string().regex(FIELD_KEY_REGEX),
    label: z.string().min(1),
    dataType: z.enum(DATA_TYPES),
    enumOptions: z.array(z.string()).optional().nullable(),
    isRequired: z.boolean().default(false),
    sortOrder: z.number().int().default(0),
  })
  .superRefine(refineEnumOptionsOnCreate);

export const UpdateFieldSchema = z
  .object({
    label: z.string().min(1).optional(),
    dataType: z.enum(DATA_TYPES).optional(),
    enumOptions: z.array(z.string()).optional().nullable(),
    isRequired: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.dataType === 'enum') {
      if (!data.enumOptions || data.enumOptions.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'enum fields require at least one enumOptions value',
          path: ['enumOptions'],
        });
      }
    } else if (data.dataType && data.enumOptions != null && data.enumOptions.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'enumOptions is only valid when dataType is enum',
        path: ['enumOptions'],
      });
    }
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

  fastify.get<{ Params: { id: string } }>(
    '/v1/admin/packs/:id/framework/fields',
    async (req, reply) => {
      const { id: packId } = req.params;
      const [pack] = await db.select().from(packs).where(eq(packs.id, packId));
      if (!pack) {
        reply.status(404).send({ error: 'PACK_NOT_FOUND' });
        return;
      }

      const fields = await db
        .select()
        .from(packFieldDefinitions)
        .where(eq(packFieldDefinitions.packId, packId))
        .orderBy(packFieldDefinitions.sortOrder, packFieldDefinitions.fieldKey);

      reply.status(200).send(fields);
    },
  );

  fastify.put<{ Params: { id: string; fieldId: string } }>(
    '/v1/admin/packs/:id/framework/fields/:fieldId',
    async (req, reply) => {
      const parsed = UpdateFieldSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.status(400).send({ error: 'VALIDATION_FAILED', issues: parsed.error.flatten() });
        return;
      }

      const { id: packId, fieldId } = req.params;
      const [existing] = await db
        .select()
        .from(packFieldDefinitions)
        .where(and(eq(packFieldDefinitions.id, fieldId), eq(packFieldDefinitions.packId, packId)));
      if (!existing) {
        reply.status(404).send({ error: 'FIELD_NOT_FOUND' });
        return;
      }

      const [updated] = await db
        .update(packFieldDefinitions)
        .set(parsed.data)
        .where(eq(packFieldDefinitions.id, fieldId))
        .returning();
      reply.status(200).send(updated);
    },
  );

  fastify.delete<{ Params: { id: string; fieldId: string } }>(
    '/v1/admin/packs/:id/framework/fields/:fieldId',
    async (req, reply) => {
      const { id: packId, fieldId } = req.params;
      const [existing] = await db
        .select()
        .from(packFieldDefinitions)
        .where(and(eq(packFieldDefinitions.id, fieldId), eq(packFieldDefinitions.packId, packId)));
      if (!existing) {
        reply.status(404).send({ error: 'FIELD_NOT_FOUND' });
        return;
      }

      // Deletes only the definition row. pois.custom_fields is never touched here —
      // stored values under this key survive so re-adding the field restores them.
      await db.delete(packFieldDefinitions).where(eq(packFieldDefinitions.id, fieldId));
      reply.status(204).send();
    },
  );
}
