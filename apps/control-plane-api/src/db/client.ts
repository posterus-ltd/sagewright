import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

export const createDb = (databaseUrl: string) => {
  const pool = new Pool({ connectionString: databaseUrl });
  return { db: drizzle(pool, { schema }), pool };
};
export type Db = ReturnType<typeof createDb>['db'];
