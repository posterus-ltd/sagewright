import { parseEnvBlob } from '@sagewright/shared';
import { eq } from 'drizzle-orm';

import type { SecretCipher } from '../crypto/secret-cipher';
import type { Db } from '../db/client';
import { userEnvs } from '../db/schema';

interface UserEnvServiceDeps {
  db: Db;
  cipher: SecretCipher;
}

/** Stores one encrypted custom `.env` blob per user, keyed by `userKey`
 *  (the caller's displayName today). Blobs are decrypted on read and used by
 *  the task service to override the worker image's baked-in env at spawn. */
export const createUserEnvService = (deps: UserEnvServiceDeps) => {
  /** The user's decrypted blob, or '' if none stored. */
  const get = async (userKey: string): Promise<string> => {
    const [row] = await deps.db.select().from(userEnvs).where(eq(userEnvs.userKey, userKey)).limit(1);
    return row ? deps.cipher.decrypt(row.envEncrypted) : '';
  };

  return {
    get,

    /** A single decrypted override value (e.g. GITHUB_TOKEN), or undefined if the
     *  user hasn't set it. Lets the control plane authenticate its own git ops
     *  with the user's token rather than only the operator's baked-in one. */
    getValue: async (userKey: string, key: string): Promise<string | undefined> =>
      parseEnvBlob(await get(userKey))[key],

    /** Encrypt and upsert the user's blob. Throws if it isn't valid `KEY=VALUE` content. */
    set: async (userKey: string, plaintext: string): Promise<void> => {
      parseEnvBlob(plaintext); // validates shape; throws are surfaced as 400 by the route
      const envEncrypted = deps.cipher.encrypt(plaintext);
      await deps.db
        .insert(userEnvs)
        .values({ userKey, envEncrypted })
        .onConflictDoUpdate({ target: userEnvs.userKey, set: { envEncrypted, updatedAt: new Date() } });
    },
  };
};

export type UserEnvService = ReturnType<typeof createUserEnvService>;
