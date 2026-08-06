import { SignJWT, jwtVerify } from 'jose';

// Standard JWT (HS256) carried in the `vm_session` httpOnly cookie. The token is
// deliberately dumb — it carries only the subject (user id); role and
// mustChangePassword are read live from the DB in the auth guard, so a reset or
// delete takes effect on the next request without any token-versioning machinery.
const ALG = 'HS256';
const ISSUER = 'sagewright-control-plane';
const AUDIENCE = 'sagewright';
const TTL = '7d';

export const createSessionCookie = (secret: string) => {
  const key = new TextEncoder().encode(secret);

  // `subject` is the authenticated user's id — the JWT `sub` claim the cookie carries.
  const sign = (subject: string): Promise<string> =>
    new SignJWT({})
      .setProtectedHeader({ alg: ALG })
      .setSubject(subject)
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime(TTL)
      .sign(key);

  const verify = async (token: string): Promise<string | null> => {
    try {
      const { payload } = await jwtVerify(token, key, {
        // Pin HS256 so a token advertising `alg:none` or an asymmetric alg is rejected.
        algorithms: [ALG],
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      return typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      // Malformed, bad signature, expired, or failing the iss/aud/alg checks.
      return null;
    }
  };

  return { sign, verify };
};
