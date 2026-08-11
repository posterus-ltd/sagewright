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

  // Last-resort clean slate. Schema changes are normally incremental, additive
  // migrations that apply non-destructively (edit schema.ts → `npm run db:generate` →
  // a new NNNN_*.sql file). DB_RESET exists only to recover a database that can't
  // migrate forward — e.g. one from the old squashed-baseline era whose tables and
  // __drizzle_migrations log no longer line up (`relation "..." already exists`). Set
  // it once to wipe and re-apply the migrations from scratch, then leave it unset and
  // continue with incremental migrations.
  //
  // DESTRUCTIVE: this wipes ALL data. It is OFF by default and must be opted into
  // explicitly — never set it against a database whose contents you need.
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
