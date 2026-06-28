import { useCallback } from 'react';

import { apiClient } from '../api/client';
import { useUserPreferences } from '../preferences/UserPreferencesProvider';
import { clearSession } from './session';

export const useAuth = () => {
  const { preference: displayName, updatePreference: setDisplayName } = useUserPreferences('displayName', null);

  const login = useCallback(async (name: string, password: string): Promise<void> => {
    await apiClient.post('/api/login', { displayName: name, password });
    setDisplayName(name);
  }, [setDisplayName]);

  const logout = useCallback((): void => { clearSession(); setDisplayName(null); }, [setDisplayName]);

  return { displayName, login, logout };
};
