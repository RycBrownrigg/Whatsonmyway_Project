import type { FastifyInstance } from 'fastify';
import { adminAuthPreHandler } from '../../middleware/adminAuth.js';
import { registerPackRoutes } from './packs.js';
import { registerFieldRoutes } from './fields.js';
import { registerFilterRoutes } from './filters.js';
import { registerPoiTypeRoutes } from './poiTypes.js';
import { registerPoiRoutes } from './pois.js';

export async function registerAdminRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', adminAuthPreHandler);
  await fastify.register(registerPackRoutes);
  await fastify.register(registerFieldRoutes);
  await fastify.register(registerFilterRoutes);
  await fastify.register(registerPoiTypeRoutes);
  await fastify.register(registerPoiRoutes);
}
