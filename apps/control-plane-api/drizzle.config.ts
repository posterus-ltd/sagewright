import path from 'node:path';
import type { Config } from 'drizzle-kit';

const appRoot = path.resolve(__dirname);
const workspaceRoot = path.resolve(__dirname, '../..');

export default {
  schema: path.join(appRoot, './src/db/schema.ts'),
  out: path.relative(workspaceRoot, path.join(appRoot, './drizzle')),
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
} satisfies Config;
