import { describe, expect, it } from 'vitest';

import { createSessionCookie } from './session-cookie';

describe('session-cookie', () => {
  const sc = createSessionCookie('topsecret');
  it('signs and verifies a display name', () => {
    expect(sc.verify(sc.sign('alice'))).toBe('alice');
  });
  it('rejects a tampered token', () => {
    expect(sc.verify(sc.sign('alice') + 'x')).toBeNull();
  });
  it('rejects an expired token', () => {
    const token = sc.sign('alice');
    const realNow = Date.now;
    Date.now = () => realNow() + 8 * 24 * 60 * 60 * 1000; // > 7-day TTL
    try {
      expect(sc.verify(token)).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });
});
