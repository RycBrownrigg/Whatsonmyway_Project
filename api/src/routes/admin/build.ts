import type { FastifyInstance } from 'fastify';
import { buildStandardPack } from '../../services/packBuild.js';
import { AppError } from '../../utils/errors.js';

// Thin wrapper over packBuild.ts's buildStandardPack — the route layer's
// only job is to call the service and map a thrown AppError to its status
// code. `report` is included only for MISSING_REQUIRED_FIELDS (D-04's
// inline failure table needs the full MissingFieldReport[]); every other
// error carries just `{ error, message }`.
export async function registerBuildRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string } }>('/v1/admin/packs/:id/build', async (req, reply) => {
    try {
      const result = await buildStandardPack(req.params.id);
      reply.status(201).send(result);
    } catch (err) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({
          error: err.code,
          message: err.message,
          ...(err.code === 'MISSING_REQUIRED_FIELDS' ? { report: err.details } : {}),
        });
        return;
      }
      throw err;
    }
  });
}
