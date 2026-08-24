import { closeDatabase } from './db/index.js';
import { runMigrations } from './db/migrate.js';

async function main(): Promise<void> {
  try {
    console.info('Running database migrations...');
    await runMigrations();
    console.info('Database migrations completed');
  } finally {
    await closeDatabase();
  }
}

main().catch((error: unknown) => {
  console.error('Database migration failed', error);
  process.exitCode = 1;
});
