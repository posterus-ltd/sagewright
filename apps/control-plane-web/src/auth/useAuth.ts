import { useCallback, useState } from 'react';

import { apiClient } from '../api/client';
import { clearSession, readSession, writeSession } from './session';

export const useAuth = () => {
  const [displayName, setDisplayName] = useState<string | null>(() => readSession());
  const login = useCallback(async (name: string, password: string): Promise<void> => {
    await apiClient.post('/api/login', { displayName: name, password });
    writeSession(name);
    setDisplayName(name);
  }, []);
  const logout = useCallback((): void => { clearSession(); setDisplayName(null); }, []);
  return { displayName, login, logout };
};
