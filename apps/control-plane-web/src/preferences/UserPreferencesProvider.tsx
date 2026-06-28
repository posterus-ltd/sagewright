import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type FC,
  type PropsWithChildren,
} from 'react';

import { PREFERENCES_STORAGE_KEY, type UserPreferences } from './model';

interface UserPreferencesContextValue {
  preferences: Partial<UserPreferences>;
  setPreference: <P extends keyof UserPreferences>(name: P, value: UserPreferences[P]) => void;
}

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);

const readStoredPreferences = (): Partial<UserPreferences> => {
  try {
    return JSON.parse(
      localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? '{}',
    ) as Partial<UserPreferences>;
  } catch {
    // Corrupt or unavailable storage falls back to defaults rather than crashing.
    return {};
  }
};

export const UserPreferencesProvider: FC<PropsWithChildren> = ({ children }) => {
  // The whole preferences object lives in provider state so every consumer
  // re-renders when any preference changes; localStorage is the durable mirror.
  const [preferences, setPreferences] = useState<Partial<UserPreferences>>(readStoredPreferences);

  const setPreference = useCallback(
    <P extends keyof UserPreferences>(name: P, value: UserPreferences[P]): void => {
      setPreferences((prev) => {
        const next = { ...prev, [name]: value };
        localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    [],
  );

  const value = useMemo<UserPreferencesContextValue>(
    () => ({ preferences, setPreference }),
    [preferences, setPreference],
  );

  return (
    <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>
  );
};

interface UseUserPreferenceResult<P extends keyof UserPreferences> {
  preference: UserPreferences[P]; // the stored value, or the fallback when unset
  updatePreference: (value: UserPreferences[P]) => void;
  isFallback: boolean; // true while no value has been persisted yet
}

// Read and update a single preference. Backed by the shared provider state, so an
// update here re-renders every other consumer reading the same preference.
export const useUserPreferences = <P extends keyof UserPreferences>(
  preferenceName: P,
  fallbackValue: UserPreferences[P],
): UseUserPreferenceResult<P> => {
  const ctx = useContext(UserPreferencesContext);
  if (!ctx) throw new Error('useUserPreferences must be used within UserPreferencesProvider');

  const stored = ctx.preferences[preferenceName];
  return {
    preference: stored ?? fallbackValue,
    updatePreference: (value) => ctx.setPreference(preferenceName, value),
    isFallback: stored === undefined,
  };
};
