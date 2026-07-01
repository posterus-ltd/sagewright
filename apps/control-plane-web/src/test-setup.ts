// Node ≥22 ships an experimental WebStorage `localStorage`/`sessionStorage` global;
// without a valid `--localstorage-file` it is a broken stub ("getItem is not a
// function"), and vitest's jsdom environment does not copy jsdom's implementation
// over a global that already exists. Force a working Storage so app code using
// bare `localStorage` behaves under tests.
const makeMemoryStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
  };
};

const isWorkingStorage = (candidate: unknown): candidate is Storage => {
  try {
    const s = candidate as Storage;
    if (typeof s?.getItem !== 'function' || typeof s?.setItem !== 'function') return false;
    s.setItem('__storage_probe__', '1');
    s.removeItem('__storage_probe__');
    return true;
  } catch {
    return false;
  }
};

for (const key of ['localStorage', 'sessionStorage'] as const) {
  const globals = globalThis as unknown as Record<string, unknown> & { window?: Record<string, unknown> };
  if (isWorkingStorage(globals[key])) continue;
  // Prefer jsdom's own Storage when it works; fall back to an in-memory shim.
  const jsdomStorage = globals.window?.[key];
  const replacement = isWorkingStorage(jsdomStorage) ? jsdomStorage : makeMemoryStorage();
  Object.defineProperty(globalThis, key, { value: replacement, configurable: true, writable: true });
}
