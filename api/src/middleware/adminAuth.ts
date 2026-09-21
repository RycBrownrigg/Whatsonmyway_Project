import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

export async function adminAuthPreHandler(req: FastifyRequest, reply: FastifyReply) {
  const expectedToken = process.env.ADMIN_API_TOKEN;
  if (!expectedToken) {
    reply.status(500).send({ error: 'ADMIN_API_TOKEN not configured' });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Unauthorized' });
    return;
  }

  const presentedToken = authHeader.slice('Bearer '.length);
  const presentedBuffer = Buffer.from(presentedToken);
  const expectedBuffer = Buffer.from(expectedToken);

  if (presentedBuffer.length !== expectedBuffer.length) {
    reply.status(403).send({ error: 'Forbidden' });
    return;
  }

  if (!timingSafeEqual(presentedBuffer, expectedBuffer)) {
    reply.status(403).send({ error: 'Forbidden' });
    return;
  }
}
