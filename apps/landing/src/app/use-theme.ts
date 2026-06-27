import { useCallback, useEffect, useState } from 'react';

/**
 * Theme override the visitor can pin. `System` follows the OS via the
 * `prefers-color-scheme` media query (no `data-theme` attribute); `Light` and
 * `Dark` pin an explicit scheme regardless of the OS preference.
 */
export enum ThemeMode {
  System = 'system',
  Light = 'light',
  Dark = 'dark',
}

/** Mirrors the inline bootstrap script in index.html — keep them in sync. */
const STORAGE_KEY = 'sagewright:theme';

/** Click order of the toggle: auto → light → dark → auto. */
const THEME_CYCLE: readonly ThemeMode[] = [
  ThemeMode.System,
  ThemeMode.Light,
  ThemeMode.Dark,
];

const isThemeMode = (value: unknown): value is ThemeMode =>
  value === ThemeMode.System ||
  value === ThemeMode.Light ||
  value === ThemeMode.Dark;

/** Read the persisted choice, defaulting to following the system scheme. */
const readStoredMode = (): ThemeMode => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isThemeMode(stored) ? stored : ThemeMode.System;
  } catch {
    return ThemeMode.System; // storage blocked (private mode) — follow system
  }
};

/**
 * Reflect the mode onto `<html>`: an explicit `data-theme` wins over the
 * `prefers-color-scheme` media query, while `System` removes the attribute so
 * the query rules again.
 */
const applyMode = (mode: ThemeMode): void => {
  const root = document.documentElement;
  if (mode === ThemeMode.System) {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', mode);
  }
};

/**
 * Owns the theme selection: seeds from localStorage, applies it to the DOM, and
 * persists every change. Returns the active mode and a cycler for the toggle.
 */
export const useTheme = () => {
  const [mode, setMode] = useState<ThemeMode>(readStoredMode);

  useEffect(() => {
    applyMode(mode);
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Storage unavailable — the choice stays in memory for this session only.
    }
  }, [mode]);

  const cycleMode = useCallback(() => {
    setMode((current) => {
      const next = (THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length;
      return THEME_CYCLE[next] ?? ThemeMode.System;
    });
  }, []);

  return { mode, cycleMode };
};
