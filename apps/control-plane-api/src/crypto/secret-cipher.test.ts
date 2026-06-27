import { describe, expect, it } from 'vitest';

import { createSecretCipher } from './secret-cipher';

describe('secret-cipher', () => {
  const cipher = createSecretCipher('0123456789abcdef0123456789abcdef');
  it('round-trips a value', () => {
    const blob = cipher.encrypt('ghp_secret');
    expect(blob).not.toContain('ghp_secret');
    expect(cipher.decrypt(blob)).toBe('ghp_secret');
  });
  it('produces different ciphertext each call (random iv)', () => {
    expect(cipher.encrypt('x')).not.toBe(cipher.encrypt('x'));
  });
});
