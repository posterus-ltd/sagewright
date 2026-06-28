import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UserPreferencesProvider, useUserPreferences } from './UserPreferencesProvider';

// Node 22 ships a non-functional experimental `localStorage` global that
// shadows jsdom's. Replace it with a real in-memory Storage for these tests.
const createStorage = (): Storage => {
  let store: Record<string, string> = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
    key: (index) => Object.keys(store)[index] ?? null,
    get length() { return Object.keys(store).length; },
  } as Storage;
};

describe('useUserPreferences', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <UserPreferencesProvider>{children}</UserPreferencesProvider>
  );

  it('returns the fallback and flags it when nothing is stored', () => {
    const { result } = renderHook(() => useUserPreferences('fullWidthContent', false), { wrapper });
    expect(result.current.preference).toBe(false);
    expect(result.current.isFallback).toBe(true);
  });

  it('persists an update and clears the fallback flag', () => {
    const { result } = renderHook(() => useUserPreferences('fullWidthContent', false), { wrapper });

    act(() => result.current.updatePreference(true));

    expect(result.current.preference).toBe(true);
    expect(result.current.isFallback).toBe(false);
    expect(JSON.parse(localStorage.getItem('sagewright.preferences')!)).toEqual({
      fullWidthContent: true,
    });
  });

  it('restores a persisted preference on mount', () => {
    localStorage.setItem('sagewright.preferences', JSON.stringify({ fullWidthContent: true }));
    const { result } = renderHook(() => useUserPreferences('fullWidthContent', false), { wrapper });
    expect(result.current.preference).toBe(true);
    expect(result.current.isFallback).toBe(false);
  });

  it('shares state across consumers under one provider, re-rendering on update', () => {
    const { result } = renderHook(
      () => ({
        a: useUserPreferences('fullWidthContent', false),
        b: useUserPreferences('fullWidthContent', false),
      }),
      { wrapper },
    );

    act(() => result.current.a.updatePreference(true));

    expect(result.current.b.preference).toBe(true);
  });

  it('throws when used outside the provider', () => {
    expect(() => renderHook(() => useUserPreferences('fullWidthContent', false))).toThrow(
      /must be used within UserPreferencesProvider/,
    );
  });
});
