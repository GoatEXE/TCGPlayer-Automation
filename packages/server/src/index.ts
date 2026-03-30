import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { env } from './config/env.js';
import { registerRoutes } from './routes/index.js';
import { registerStatic } from './plugins/static.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(multipart);

app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// Register API routes before static files (so /api/* takes priority)
console.log('[DEBUG] Registering routes...');
try {
  await registerRoutes(app);
  console.log('[DEBUG] Routes registered successfully');
  console.log('[DEBUG] Registered routes:', app.printRoutes());
} catch (err) {
  console.error('[DEBUG] Failed to register routes:', err);
  throw err;
}

// Register static file serving (production only)
await registerStatic(app);

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

export { app };
