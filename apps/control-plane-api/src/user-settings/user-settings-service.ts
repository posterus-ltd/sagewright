import { eq } from 'drizzle-orm';

import type { Db } from '../db/client';
import { userSettings } from '../db/schema';

interface UserSettingsServiceDeps {
  db: Db;
}

export const createUserSettingsService = (deps: UserSettingsServiceDeps) => ({
  getDefaultWorker: async (userKey: string): Promise<string | null> => {
    const [row] = await deps.db.select().from(userSettings).where(eq(userSettings.userKey, userKey)).limit(1);
    return row?.defaultWorkerImage ?? null;
  },

  setDefaultWorker: async (userKey: string, image: string): Promise<void> => {
    await deps.db
      .insert(userSettings)
      .values({ userKey, defaultWorkerImage: image })
      .onConflictDoUpdate({ target: userSettings.userKey, set: { defaultWorkerImage: image, updatedAt: new Date() } });
  },
});

export type UserSettingsService = ReturnType<typeof createUserSettingsService>;
