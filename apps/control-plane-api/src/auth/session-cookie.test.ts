import { decodeJwt } from 'jose';
import { describe, expect, it, vi } from 'vitest';

import { createSessionCookie } from './session-cookie';

describe('session-cookie', () => {
  const sc = createSessionCookie('topsecret');

  it('signs and verifies a subject', async () => {
    expect(await sc.verify(await sc.sign('alice'))).toBe('alice');
  });

  it('issues a standard JWT carrying the subject', async () => {
    const token = await sc.sign('alice');
    expect(token.split('.')).toHaveLength(3); // header.payload.signature
    expect(decodeJwt(token).sub).toBe('alice');
  });

  it('rejects a tampered token', async () => {
    expect(await sc.verify((await sc.sign('alice')) + 'x')).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const other = createSessionCookie('different-secret');
    expect(await sc.verify(await other.sign('alice'))).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await sc.sign('alice');
    const future = Date.now() + 8 * 24 * 60 * 60 * 1000; // > 7-day TTL
    vi.useFakeTimers();
    vi.setSystemTime(future);
    try {
      expect(await sc.verify(token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
