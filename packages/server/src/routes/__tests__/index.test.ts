import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerRoutes } from '../index.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('route registration', () => {
  it('retains catalog and web collection workflow routes without mobile routes', async () => {
    app = Fastify();
    await registerRoutes(app);

    expect(app.hasRoute({ method: 'GET', url: '/api/catalog/status' })).toBe(true);
    expect(
      app.hasRoute({
        method: 'POST',
        url: '/api/collections/:id/import/preview',
      }),
    ).toBe(true);
    expect(
      app.hasRoute({
        method: 'POST',
        url: '/api/collections/:id/transfer-to-inventory',
      }),
    ).toBe(true);

    expect(
      app.hasRoute({ method: 'POST', url: '/api/collections/scan-preview' }),
    ).toBe(false);
    expect(
      app.hasRoute({ method: 'POST', url: '/api/collections/split-scan' }),
    ).toBe(false);
    expect(
      app.hasRoute({ method: 'POST', url: '/api/collections/:id/items/bulk' }),
    ).toBe(false);
    expect(
      app.hasRoute({ method: 'POST', url: '/api/scanner/resolve-text' }),
    ).toBe(false);
  });
});
