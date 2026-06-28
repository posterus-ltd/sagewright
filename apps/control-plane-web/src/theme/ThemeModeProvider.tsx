import { CssBaseline, ThemeProvider } from '@mui/material';
import { createContext, useContext, useEffect, useMemo, useState, type FC, type ReactNode } from 'react';

import { useUserPreferences } from '../preferences/UserPreferencesProvider';
import { buildTheme, type ResolvedMode, type ThemeMode } from './theme';

export type { ThemeMode } from './theme';

interface ThemeModeContextValue {
  mode: ThemeMode; // the user's preference
  resolvedMode: ResolvedMode; // what's actually rendered
  setMode: (mode: ThemeMode) => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

const systemPrefersDark = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

export const resolveMode = (mode: ThemeMode, prefersDark: boolean): ResolvedMode => {
  if (mode === 'system') return prefersDark ? 'dark' : 'light';
  return mode;
};

export const ThemeModeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  // The user's choice is persisted as a user preference; only the live
  // OS-preference resolution stays local to this provider.
  const { preference: mode, updatePreference: setMode } = useUserPreferences('themeMode', 'system');
  const [prefersDark, setPrefersDark] = useState<boolean>(systemPrefersDark);

  // Follow the OS preference live while the user is on "system".
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent): void => setPrefersDark(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolvedMode = resolveMode(mode, prefersDark);
  const theme = useMemo(() => buildTheme(resolvedMode), [resolvedMode]);
  const value = useMemo<ThemeModeContextValue>(
    () => ({ mode, resolvedMode, setMode }),
    [mode, resolvedMode, setMode],
  );

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
};

export const useThemeMode = (): ThemeModeContextValue => {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used within ThemeModeProvider');
  return ctx;
};
