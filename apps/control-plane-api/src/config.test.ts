import { describe, expect, it } from 'vitest';

import { loadConfig } from './config';

const base = {
  DATABASE_URL: 'postgres://x', APP_PASSWORD: 'p', SESSION_SECRET: 's',
  SECRETS_KEY: '0123456789abcdef0123456789abcdef',
  WORKER_IMAGE: 'w', CONTROL_PLANE_URL: 'http://c',
};

describe('loadConfig', () => {
  it('parses a complete env', () => {
    expect(loadConfig({ ...base, PORT: '4000' }).port).toBe(4000);
  });
  it('leaves linearApiKey undefined when LINEAR_API_KEY is absent', () => {
    expect(loadConfig(base).linearApiKey).toBeUndefined();
  });
  it('surfaces LINEAR_API_KEY as linearApiKey', () => {
    expect(loadConfig({ ...base, LINEAR_API_KEY: 'lin_abc' }).linearApiKey).toBe('lin_abc');
  });
  it('throws when a required var is missing', () => {
    const { DATABASE_URL: _omit, ...withoutDb } = base;
    expect(() => loadConfig(withoutDb)).toThrow();
  });
  it('rejects a SECRETS_KEY that is not 32 chars', () => {
    expect(() => loadConfig({ ...base, SECRETS_KEY: 'short' })).toThrow();
  });
});
