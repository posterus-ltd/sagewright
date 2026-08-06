import { eq } from 'drizzle-orm';

import type { Db } from '../db/client';
import { userSettings } from '../db/schema';

interface UserSettingsServiceDeps {
  db: Db;
}

export const createUserSettingsService = (deps: UserSettingsServiceDeps) => ({
  getDefaultRunner: async (userId: string): Promise<string | null> => {
    const [row] = await deps.db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    return row?.defaultRunnerImage ?? null;
  },

  setDefaultRunner: async (userId: string, image: string): Promise<void> => {
    await deps.db
      .insert(userSettings)
      .values({ userId, defaultRunnerImage: image })
      .onConflictDoUpdate({ target: userSettings.userId, set: { defaultRunnerImage: image, updatedAt: new Date() } });
  },
});

export type UserSettingsService = ReturnType<typeof createUserSettingsService>;
