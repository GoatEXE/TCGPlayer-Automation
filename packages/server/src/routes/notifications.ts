import { desc } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { notificationEvents } from '../db/schema/notification-events.js';

export async function notificationsRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Querystring: {
      limit?: string;
    };
  }>('/', async (request, reply) => {
    const parsedLimit = Number.parseInt(request.query.limit ?? '', 10);
    const limitNum = Number.isNaN(parsedLimit)
      ? 50
      : Math.min(Math.max(parsedLimit, 1), 200);

    try {
      const events = await db
        .select()
        .from(notificationEvents)
        .orderBy(desc(notificationEvents.createdAt))
        .limit(limitNum);

      return reply.send({
        events,
        limit: limitNum,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply
        .code(500)
        .send({ error: 'Failed to fetch notification events' });
    }
  });
}
