import { type LoginResult } from '@sagewright/shared';
import { useCallback } from 'react';

import { apiClient } from '../api/client';
import { useUserPreferences } from '../preferences/UserPreferencesProvider';
import { clearSession } from './session';

export const useAuth = () => {
  const { preference: displayName, updatePreference: setDisplayName } = useUserPreferences('displayName', null);
  const { preference: userId, updatePreference: setUserId } = useUserPreferences('userId', null);

  const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    const result = await apiClient.post<LoginResult>('/api/login', { username, password });
    setUserId(result.id);
    setDisplayName(result.username);
    return result;
  }, [setDisplayName, setUserId]);

  const logout = useCallback(async (): Promise<void> => {
    // Best-effort server-side cookie clear; the client state is reset regardless.
    try {
      await apiClient.post('/api/logout');
    } catch {
      // A failed logout still signs the user out locally.
    }
    clearSession();
    setUserId(null);
    setDisplayName(null);
  }, [setDisplayName, setUserId]);

  return { userId, displayName, login, logout };
};
