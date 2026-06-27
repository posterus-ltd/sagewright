import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { loadConfig } from '../config';
import { createDb } from './client';

// Resolve migrations folder relative to this file's location at build time.
// esbuild copies the directory structure, so __dirname points to
// apps/control-plane-api/dist/db/ in the container — two levels up is dist/,
// but we need the migrations in apps/control-plane-api/drizzle/ relative to
// the workspace root (/app in the container).
// The Dockerfile copies the whole repo so drizzle/ is at
// /app/apps/control-plane-api/drizzle relative to workdir.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, '../../drizzle');

const run = async (): Promise<void> => {
  const config = loadConfig(process.env);
  const { db, pool } = createDb(config.databaseUrl);
  await migrate(db, { migrationsFolder });
  await pool.end();
};

run().then(() => process.exit(0)).catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
