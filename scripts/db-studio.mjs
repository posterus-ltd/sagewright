#!/usr/bin/env node
// Launch Drizzle Studio against the local dev database.
//
// Drizzle Studio is a generic, schema-driven browser of the database: every
// table with typed column headers and paginated rows, read straight from
// apps/control-plane-api/src/db/schema.ts — so new tables appear automatically,
// nothing is hard-coded to today's schema.
//
//   npm run db:studio   →   opens https://local.drizzle.studio
//
// LOCAL DEVELOPMENT ONLY. Studio connects directly to Postgres with full
// read/write access and no authentication of its own. Never expose it or point
// it at a deployed/production database.
//
// Why this wrapper instead of a bare `drizzle-kit studio`:
// - .env holds only POSTGRES_USER/PASSWORD/DB; the compose-assembled DATABASE_URL
//   uses the internal hostname `postgres`, which does not resolve from the host.
//   Studio runs on the host, so it needs localhost:5432 (the published port from
//   docker-compose.yml). We compose that here.
// - Cross-platform: the repo supports Windows (start.bat), so we avoid inline
//   `VAR=... drizzle-kit` shell syntax.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Load .env from the repo root so POSTGRES_* are available. Node 22 ships
// process.loadEnvFile; a missing .env is non-fatal (we fall back to defaults).
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  // No .env — rely on the process environment and the defaults below.
}

// Prefer an explicitly-set DATABASE_URL (e.g. to point at an external Postgres);
// otherwise compose a host-reachable URL from the POSTGRES_* parts. Defaults
// mirror docker-compose.yml.
const user = process.env.POSTGRES_USER ?? 'postgres';
const password = process.env.POSTGRES_PASSWORD ?? 'postgres';
const database = process.env.POSTGRES_DB ?? 'sage';
const databaseUrl = process.env.DATABASE_URL ?? `postgres://${user}:${password}@localhost:5432/${database}`;

// Mask the password when echoing the URL.
const masked = databaseUrl.replace(/:\/\/([^:]+):[^@]*@/, '://$1:••••@');

console.log('Drizzle Studio — generic browser of the local dev database');
console.log(`  database: ${masked}`);
console.log('  requires: the compose Postgres running (docker compose up -d postgres, or ./start.sh)');
console.log('  scope:    LOCAL DEVELOPMENT ONLY — never point this at production.');
console.log('');

const child = spawn(
  'npx',
  ['drizzle-kit', 'studio', '--config', 'apps/control-plane-api/drizzle.config.ts'],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
    // npx resolves the local drizzle-kit bin cross-platform; Windows needs a shell.
    shell: process.platform === 'win32',
  },
);

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error(`failed to launch drizzle-kit: ${err.message}`);
  process.exit(1);
});
