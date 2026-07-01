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

// Truthy env flag parser — accepts 1/true/yes (case-insensitive).
const isEnabled = (v: string | undefined): boolean => /^(1|true|yes)$/i.test(v ?? '');

const run = async (): Promise<void> => {
  const config = loadConfig(process.env);
  const { db, pool } = createDb(config.databaseUrl);

  // One-time clean slate. The migration history was squashed into a single 0000
  // baseline, so a database that already ran the old numbered migrations conflicts:
  // its tables still exist and its __drizzle_migrations log no longer matches the
  // journal, so the fresh CREATE TABLEs fail. Setting DB_RESET drops the whole public
  // schema first, letting the squashed baseline apply to an empty database.
  //
  // DESTRUCTIVE: this wipes ALL data. It is OFF by default and must be opted into
  // explicitly (the schema-squash transition, or a throwaway dev DB) — never set it
  // against a database whose contents you need.
  if (isEnabled(process.env.DB_RESET)) {
    console.warn('DB_RESET set — dropping and re-creating the "public" schema (ALL data will be lost)');
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  }

  await migrate(db, { migrationsFolder });
  await pool.end();
};

run().then(() => process.exit(0)).catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
