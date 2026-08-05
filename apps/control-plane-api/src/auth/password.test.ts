import { describe, expect, it } from 'vitest';

import { generateInitialPassword, hashPassword, verifyPassword } from './password';

describe('hashPassword / verifyPassword', () => {
  it('round-trips a correct password', () => {
    const stored = hashPassword('correct horse');
    expect(verifyPassword('correct horse', stored)).toBe(true);
  });

  it('rejects a wrong password', () => {
    const stored = hashPassword('correct horse');
    expect(verifyPassword('battery staple', stored)).toBe(false);
  });

  it('uses a random salt so the same password hashes differently each time', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });

  it('produces a self-describing scrypt$salt$hash string', () => {
    expect(hashPassword('x').split('$')).toHaveLength(3);
    expect(hashPassword('x').startsWith('scrypt$')).toBe(true);
  });

  it('returns false (never throws) on malformed stored values', () => {
    expect(verifyPassword('x', '')).toBe(false);
    expect(verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(verifyPassword('x', 'scrypt$onlytwo')).toBe(false);
    expect(verifyPassword('x', 'bcrypt$salt$hash')).toBe(false);
    expect(verifyPassword('x', 'scrypt$$')).toBe(false);
  });
});

describe('generateInitialPassword', () => {
  it('is grouped and readable, drawn from an unambiguous alphabet', () => {
    const pw = generateInitialPassword();
    expect(pw).toMatch(/^[2-9a-hjkmnp-z]{4}-[2-9a-hjkmnp-z]{4}-[2-9a-hjkmnp-z]{4}$/);
    // No ambiguous characters.
    expect(pw).not.toMatch(/[01oil]/);
  });

  it('is different on each call', () => {
    expect(generateInitialPassword()).not.toBe(generateInitialPassword());
  });
});
