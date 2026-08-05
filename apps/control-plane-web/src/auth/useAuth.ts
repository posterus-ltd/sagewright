import { type LoginResult } from '@sagewright/shared';
import { useCallback } from 'react';

import { apiClient } from '../api/client';
import { useUserPreferences } from '../preferences/UserPreferencesProvider';
import { clearSession } from './session';

export const useAuth = () => {
  const { preference: displayName, updatePreference: setDisplayName } = useUserPreferences('displayName', null);

  const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    const result = await apiClient.post<LoginResult>('/api/login', { username, password });
    setDisplayName(result.username);
    return result;
  }, [setDisplayName]);

  const logout = useCallback(async (): Promise<void> => {
    // Best-effort server-side cookie clear; the client state is reset regardless.
    try {
      await apiClient.post('/api/logout');
    } catch {
      // A failed logout still signs the user out locally.
    }
    clearSession();
    setDisplayName(null);
  }, [setDisplayName]);

  return { displayName, login, logout };
};
