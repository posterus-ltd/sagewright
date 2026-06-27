import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ThemeToggle } from './ThemeToggle';

const STORAGE_KEY = 'sagewright:theme';

/** jsdom in this config ships no functional localStorage, so back it with a
 *  simple in-memory Map for the duration of each test. */
const installMemoryStorage = (): Map<string, string> => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    },
  });
  return store;
};

describe('ThemeToggle', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = installMemoryStorage();
  });

  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to auto (system) when nothing is stored', () => {
    const { getByRole } = render(<ThemeToggle />);
    expect(getByRole('button').textContent).toContain('auto');
    // Auto follows the system scheme, so no attribute is pinned.
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('cycles auto → light → dark → auto, pinning data-theme and persisting', () => {
    const { getByRole } = render(<ThemeToggle />);
    const button = getByRole('button');

    fireEvent.click(button);
    expect(button.textContent).toContain('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(store.get(STORAGE_KEY)).toBe('light');

    fireEvent.click(button);
    expect(button.textContent).toContain('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(store.get(STORAGE_KEY)).toBe('dark');

    fireEvent.click(button);
    expect(button.textContent).toContain('auto');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(store.get(STORAGE_KEY)).toBe('system');
  });

  it('restores a previously stored selection on mount', () => {
    store.set(STORAGE_KEY, 'dark');
    const { getByRole } = render(<ThemeToggle />);
    expect(getByRole('button').textContent).toContain('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
