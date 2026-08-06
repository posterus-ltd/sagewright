import { describe, expect, it } from 'vitest';

import { loadConfig } from './config';

const base = {
  DATABASE_URL: 'postgres://x', ROOT_PASSWORD: 'p', SESSION_SECRET: 's',
  SECRETS_KEY: '0123456789abcdef0123456789abcdef',
  RUNNER_IMAGE: 'w',
};

describe('loadConfig', () => {
  it('parses a complete env', () => {
    expect(loadConfig({ ...base, PORT: '4000' }).port).toBe(4000);
  });
  it('surfaces ROOT_PASSWORD as rootPassword', () => {
    expect(loadConfig({ ...base, ROOT_PASSWORD: 'seed-me' }).rootPassword).toBe('seed-me');
  });
  it('falls back to the legacy APP_PASSWORD when ROOT_PASSWORD is unset', () => {
    const { ROOT_PASSWORD: _omit, ...withoutRoot } = base;
    expect(loadConfig({ ...withoutRoot, APP_PASSWORD: 'legacy' }).rootPassword).toBe('legacy');
  });
  it('throws when neither ROOT_PASSWORD nor APP_PASSWORD is set', () => {
    const { ROOT_PASSWORD: _omit, ...withoutRoot } = base;
    expect(() => loadConfig(withoutRoot)).toThrow();
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
