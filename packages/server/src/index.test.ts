import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from './index.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('server health endpoints', () => {
  it.each(['/health', '/healthz'])('reports liveness at %s', async (url) => {
    const runtime = await createServer();
    app = runtime.app;

    const response = await app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
  });

  it('reports readiness only after startup has completed', async () => {
    const runtime = await createServer();
    app = runtime.app;

    const starting = await app.inject({ method: 'GET', url: '/ready' });
    expect(starting.statusCode).toBe(503);
    expect(starting.json()).toMatchObject({ status: 'not_ready' });

    runtime.setReady(true);
    const ready = await app.inject({ method: 'GET', url: '/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: 'ready' });

    runtime.setReady(false);
    const stopping = await app.inject({ method: 'GET', url: '/ready' });
    expect(stopping.statusCode).toBe(503);
  });
});
