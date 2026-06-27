import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeModeProvider, resolveMode, useThemeMode } from './ThemeModeProvider';

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

const mockMatchMedia = (matches: boolean): void => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
};

describe('resolveMode', () => {
  it('follows the system preference when mode is "system"', () => {
    expect(resolveMode('system', true)).toBe('dark');
    expect(resolveMode('system', false)).toBe('light');
  });

  it('honours an explicit choice regardless of system preference', () => {
    expect(resolveMode('light', true)).toBe('light');
    expect(resolveMode('dark', false)).toBe('dark');
  });
});

describe('ThemeModeProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeModeProvider>{children}</ThemeModeProvider>
  );

  it('defaults to system preference (dark) on first load', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useThemeMode(), { wrapper });
    expect(result.current.mode).toBe('system');
    expect(result.current.resolvedMode).toBe('dark');
  });

  it('persists an explicit choice and resolves to it', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useThemeMode(), { wrapper });

    act(() => result.current.setMode('light'));

    expect(result.current.resolvedMode).toBe('light');
    expect(localStorage.getItem('sagewright.theme-mode')).toBe('light');
  });

  it('restores the persisted choice on reload', () => {
    mockMatchMedia(true);
    localStorage.setItem('sagewright.theme-mode', 'light');
    const { result } = renderHook(() => useThemeMode(), { wrapper });
    expect(result.current.mode).toBe('light');
    expect(result.current.resolvedMode).toBe('light');
  });

  it('renders children inside the provider', () => {
    mockMatchMedia(false);
    render(<div>terminal ready</div>, { wrapper });
    expect(screen.getByText('terminal ready')).toBeTruthy();
  });
});
