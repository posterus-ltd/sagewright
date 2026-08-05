import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Password hashing with Node's built-in scrypt — no native dependency, consistent
// with the node:crypto usage in session-cookie.ts / secret-cipher.ts. The stored
// value is self-describing so a future algorithm change can coexist:
//   scrypt$<saltBase64>$<hashBase64>
const SCHEME = 'scrypt';
const SALT_BYTES = 16;
const KEY_LEN = 64;

/** Hash a plaintext password into a self-describing `scrypt$<salt>$<hash>` string. */
export const hashPassword = (plain: string): string => {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(plain, salt, KEY_LEN);
  return `${SCHEME}$${salt.toString('base64')}$${hash.toString('base64')}`;
};

/**
 * Verify a plaintext password against a stored `scrypt$<salt>$<hash>` string.
 * Returns false (never throws) on any malformed input, and compares in constant time.
 */
export const verifyPassword = (plain: string, stored: string): boolean => {
  const parts = stored.split('$');
  if (parts.length !== 3) return false;
  const [scheme, saltB64, hashB64] = parts;
  if (scheme !== SCHEME || !saltB64 || !hashB64) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64, 'base64');
    expected = Buffer.from(hashB64, 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = scryptSync(plain, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

// Unambiguous Crockford-style alphabet: no 0/O, 1/I/L to keep a shared password
// readable when typed by hand from a screenshot or chat message.
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const GROUPS = 3;
const GROUP_LEN = 4;

/**
 * A readable one-time password like `k7fp-h3mq-r9tx` (~59 bits). Shown to an admin
 * once to share out-of-band; the account is forced to change it on first login.
 */
export const generateInitialPassword = (): string => {
  const bytes = randomBytes(GROUPS * GROUP_LEN);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  const groups: string[] = [];
  for (let i = 0; i < GROUPS; i += 1) {
    groups.push(chars.slice(i * GROUP_LEN, (i + 1) * GROUP_LEN).join(''));
  }
  return groups.join('-');
};
