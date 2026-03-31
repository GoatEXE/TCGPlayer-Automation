import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Works in both dev (`src/db`) and prod (`dist/db`) builds
const migrationsFolder = path.resolve(__dirname, '../../drizzle');

export async function runMigrations() {
  await migrate(db, { migrationsFolder });
}
