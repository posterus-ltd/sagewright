import { eq } from 'drizzle-orm';
import { DEFAULT_USER_SETTINGS, type UserSettings, type UserSettingsPatch } from '@sagewright/shared';

import type { Db } from '../db/client';
import { userSettings } from '../db/schema';

interface UserSettingsServiceDeps {
  db: Db;
}

export const createUserSettingsService = (deps: UserSettingsServiceDeps) => {
  // The caller's full settings, with defaults applied for a user who has no row yet.
  const get = async (userId: string): Promise<UserSettings> => {
    const [row] = await deps.db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    if (!row) return { ...DEFAULT_USER_SETTINGS };
    return { defaultRunnerImage: row.defaultRunnerImage, mcpEnabled: row.mcpEnabled };
  };

  // Upsert only the keys present in `patch`; unspecified columns keep their stored value
  // (or the column default on first write). Returns the full, merged settings so callers
  // never have to re-read.
  const update = async (userId: string, patch: UserSettingsPatch): Promise<UserSettings> => {
    const changes: UserSettingsPatch = {};
    if (patch.defaultRunnerImage !== undefined) changes.defaultRunnerImage = patch.defaultRunnerImage;
    if (patch.mcpEnabled !== undefined) changes.mcpEnabled = patch.mcpEnabled;
    if (Object.keys(changes).length > 0) {
      await deps.db
        .insert(userSettings)
        .values({ userId, ...changes })
        .onConflictDoUpdate({ target: userSettings.userId, set: { ...changes, updatedAt: new Date() } });
    }
    return get(userId);
  };

  return { get, update };
};

export type UserSettingsService = ReturnType<typeof createUserSettingsService>;
