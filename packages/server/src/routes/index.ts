import type { FastifyInstance } from 'fastify';
import { cardsRoutes } from './cards.js';
import { salesRoutes } from './sales.js';
import { shipmentsRoutes } from './shipments.js';
import { invoiceRoutes } from './invoices.js';

export async function registerRoutes(fastify: FastifyInstance) {
  // Register all route plugins under /api prefix
  await fastify.register(cardsRoutes, { prefix: '/api/cards' });
  await fastify.register(salesRoutes, { prefix: '/api/sales' });
  await fastify.register(shipmentsRoutes, { prefix: '/api' });
  await fastify.register(invoiceRoutes, { prefix: '/api' });
}
