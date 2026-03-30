import type { FastifyInstance } from 'fastify';
import { cardsRoutes } from './cards.js';

export async function registerRoutes(fastify: FastifyInstance) {
  // Register all route plugins under /api prefix
  await fastify.register(cardsRoutes, { prefix: '/api/cards' });
}
