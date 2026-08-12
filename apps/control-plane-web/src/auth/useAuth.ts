import { type LoginResult } from '@sagewright/shared';
import { useCallback } from 'react';

import { useApiClient } from '../api/ApiClientProvider';
import { useUserPreferences } from '../preferences/UserPreferencesProvider';
import { clearSession } from './session';

export const useAuth = () => {
  const api = useApiClient();
  const { preference: displayName, updatePreference: setDisplayName } = useUserPreferences('displayName', null);
  const { preference: userId, updatePreference: setUserId } = useUserPreferences('userId', null);

  const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    const result = await api.post<LoginResult>('/api/login', { username, password });
    setUserId(result.id);
    setDisplayName(result.username);
    return result;
  }, [api, setDisplayName, setUserId]);

  const logout = useCallback(async (): Promise<void> => {
    // Best-effort server-side cookie clear; the client state is reset regardless.
    try {
      await api.post('/api/logout');
    } catch {
      // A failed logout still signs the user out locally.
    }
    clearSession();
    setUserId(null);
    setDisplayName(null);
  }, [api, setDisplayName, setUserId]);

  return { userId, displayName, login, logout };
};
