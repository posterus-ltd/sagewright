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
  it('defaults allowSessionDeletion to true when ALLOW_SESSION_DELETION is unset', () => {
    expect(loadConfig(base).allowSessionDeletion).toBe(true);
  });
  it('disables session deletion when ALLOW_SESSION_DELETION=false', () => {
    expect(loadConfig({ ...base, ALLOW_SESSION_DELETION: 'false' }).allowSessionDeletion).toBe(false);
  });
  it('rejects a non-boolean ALLOW_SESSION_DELETION instead of silently re-enabling deletion', () => {
    expect(() => loadConfig({ ...base, ALLOW_SESSION_DELETION: 'no' })).toThrow();
  });
  it('surfaces SCHEDULER_TIMEZONE as schedulerTimezone', () => {
    expect(loadConfig({ ...base, SCHEDULER_TIMEZONE: 'Europe/Sofia' }).schedulerTimezone).toBe('Europe/Sofia');
  });
  it('leaves schedulerTimezone undefined when unset (crons run in server-local time)', () => {
    expect(loadConfig(base).schedulerTimezone).toBeUndefined();
  });
  it('rejects an unknown SCHEDULER_TIMEZONE instead of silently falling back', () => {
    expect(() => loadConfig({ ...base, SCHEDULER_TIMEZONE: 'Mars/Olympus_Mons' })).toThrow();
  });
});
