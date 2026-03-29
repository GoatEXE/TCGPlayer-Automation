import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

export { app };
