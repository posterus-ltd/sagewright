import { createHmac, timingSafeEqual } from 'node:crypto';

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const createSessionCookie = (secret: string) => {
  // `subject` is the authenticated user's id — the opaque payload the cookie carries.
  const sign = (subject: string): string => {
    const expiry = String(Date.now() + TTL_MS);
    const body = `${Buffer.from(subject).toString('base64url')}.${expiry}`;
    const mac = createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${mac}`;
  };
  const verify = (token: string): string | null => {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [subjectB64, expiry, mac] = parts;
    if (subjectB64 === undefined || expiry === undefined || mac === undefined) return null;
    // verify MAC before expiry so an expired-token check can't leak a timing oracle
    const macBuf = Buffer.from(mac, 'base64url');
    const expectedBuf = createHmac('sha256', secret).update(`${subjectB64}.${expiry}`).digest();
    if (macBuf.length !== expectedBuf.length || !timingSafeEqual(macBuf, expectedBuf)) return null;
    if (Number(expiry) < Date.now()) return null;
    return Buffer.from(subjectB64, 'base64url').toString('utf8');
  };
  return { sign, verify };
};
