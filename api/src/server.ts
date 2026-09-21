import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerAdminRoutes } from './routes/admin/index.js';

export function buildApp() {
  const app = Fastify({ logger: { redact: ['req.headers.authorization'] } });

  app.register(cors, {
    origin: process.env.ADMIN_ORIGIN ?? 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.register(registerAdminRoutes);

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const app = buildApp();
  const port = Number(process.env.PORT ?? 3003);
  const host = process.env.HOST ?? '0.0.0.0';

  app
    .listen({ port, host })
    .catch((err) => {
      app.log.error(err);
      process.exit(1);
    });
}
