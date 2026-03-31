import { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function registerStatic(app: FastifyInstance) {
  if (process.env.NODE_ENV === 'production') {
    const webDistPath = join(__dirname, '..', '..', '..', 'web', 'dist');

    // Serve static files from the built React app
    await app.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
      constraints: {},
    });

    // SPA fallback: serve index.html for all non-API routes
    app.setNotFoundHandler((request, reply) => {
      // Only fall back to index.html for non-API routes
      if (
        !request.url.startsWith('/api/') &&
        !request.url.startsWith('/health')
      ) {
        reply.sendFile('index.html');
      } else {
        reply.code(404).send({ error: 'Not Found' });
      }
    });
  }
}
