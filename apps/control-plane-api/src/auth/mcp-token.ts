import { SignJWT, jwtVerify } from 'jose';

// A session-scoped bearer the control plane MINTS ITSELF and injects into each runner
// container (SAGEWRIGHT_MCP_TOKEN), so an agent can call the /mcp endpoint back as the
// user who owns its session — without any external IdP. It is a sibling of the browser
// session cookie (same HS256 secret) but pinned to a DISTINCT audience so the two are
// never interchangeable: a cookie can't authenticate an MCP call and vice-versa. It
// carries the acting user (`sub`) and the originating session (`sid`), which the /mcp
// guard uses as the parent for anything the agent spawns (lineage + spawn guardrails).
const ALG = 'HS256';
const ISSUER = 'sagewright-control-plane';
const AUDIENCE = 'sagewright-mcp';
// Generous relative to a session's lifetime: an MCP call after the token expires simply
// 401s, so the ceiling only has to outlast realistic agent runs, not be short-lived.
const TTL = '30d';

export interface McpTokenClaims {
  /** The user the agent acts as — the `createdBy` of everything it spawns. */
  userId: string;
  /** The session the agent is running in — the parent of anything it spawns. */
  sessionId: string;
}

export const createMcpToken = (secret: string) => {
  const key = new TextEncoder().encode(secret);

  const sign = ({ userId, sessionId }: McpTokenClaims): Promise<string> =>
    new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: ALG })
      .setSubject(userId)
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime(TTL)
      .sign(key);

  const verify = async (token: string): Promise<McpTokenClaims | null> => {
    try {
      const { payload } = await jwtVerify(token, key, {
        // Pin HS256 and the MCP audience so a browser cookie (audience `sagewright`)
        // or an `alg:none` token is rejected here.
        algorithms: [ALG],
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
      return { userId: payload.sub, sessionId: payload.sid };
    } catch {
      // Malformed, bad signature, expired, or failing the iss/aud/alg checks.
      return null;
    }
  };

  return { sign, verify };
};

export type McpToken = ReturnType<typeof createMcpToken>;
