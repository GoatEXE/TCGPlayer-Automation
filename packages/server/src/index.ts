import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { env } from './config/env.js';
import { closeDatabase } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import {
  startPriceCheckScheduler,
  stopPriceCheckScheduler,
} from './lib/price-check/index.js';
import { registerStatic } from './plugins/static.js';
import { registerRoutes } from './routes/index.js';

export interface ServerRuntime {
  app: FastifyInstance;
  isReady: () => boolean;
  setReady: (ready: boolean) => void;
}

/**
 * Build the base server without touching external services. Startup marks the
 * instance ready only after migrations, scheduler setup, and route registration.
 */
export async function createServer(): Promise<ServerRuntime> {
  const app = Fastify({ logger: true });
  let ready = false;

  await app.register(cors, { origin: true });
  await app.register(multipart);

  const liveness = async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });

  app.get('/health', liveness);
  app.get('/healthz', liveness);
  app.get('/ready', async (_request, reply) => {
    if (!ready) {
      return reply.code(503).send({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
    };
  });

  return {
    app,
    isReady: () => ready,
    setReady: (nextReady) => {
      ready = nextReady;
    },
  };
}

export async function startServer(): Promise<ServerRuntime> {
  const runtime = await createServer();
  const { app } = runtime;
  let schedulerStarted = false;

  try {
    if (env.RUN_MIGRATIONS_ON_START) {
      app.log.info('Running database migrations...');
      await runMigrations();
      app.log.info('Database migrations completed');
    } else {
      app.log.info('Startup migrations disabled; expecting a migration job');
    }

    await startPriceCheckScheduler(app.log);
    schedulerStarted = true;

    app.addHook('onClose', async () => {
      runtime.setReady(false);
      try {
        if (schedulerStarted) {
          await stopPriceCheckScheduler();
        }
      } finally {
        await closeDatabase();
      }
    });

    // API routes take priority over the production static-file fallback.
    await registerRoutes(app);
    await registerStatic(app);

    runtime.setReady(true);
    await app.listen({ port: env.PORT, host: env.HOST });
    return runtime;
  } catch (error) {
    runtime.setReady(false);
    app.log.error(error);

    if (schedulerStarted) {
      await stopPriceCheckScheduler().catch((stopError: unknown) => {
        app.log.error(stopError);
      });
    }
    await closeDatabase().catch((closeError: unknown) => {
      app.log.error(closeError);
    });
    throw error;
  }
}

export function installShutdownHandlers(runtime: ServerRuntime): () => void {
  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    runtime.setReady(false);
    runtime.app.log.info({ signal }, 'Graceful shutdown requested');

    void runtime.app.close().catch((error: unknown) => {
      runtime.app.log.error(error);
      process.exitCode = 1;
    });
  };

  const onSigint = () => shutdown('SIGINT');
  const onSigterm = () => shutdown('SIGTERM');

  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  return () => {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  };
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(
    entrypoint &&
    path.resolve(entrypoint) === path.resolve(fileURLToPath(import.meta.url)),
  );
}

if (isMainModule()) {
  startServer()
    .then((runtime) => {
      installShutdownHandlers(runtime);
    })
    .catch(() => {
      process.exitCode = 1;
    });
}
