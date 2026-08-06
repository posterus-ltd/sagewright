import cookie from '@fastify/cookie';
import {
  changePasswordSchema,
  isAdminRole,
  loginSchema,
  type MeResponse,
} from '@sagewright/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { UserServiceError, type UserService } from '../users/user-service';
import { createSessionCookie } from './session-cookie';

const COOKIE_NAME = 'vm_session';

// Paths a user with `mustChangePassword` set may still reach — everything else is
// gated behind the forced-change screen. One seam gates the whole app.
const PASSWORD_CHANGE_ALLOWLIST = new Set(['/api/change-password', '/api/logout', '/api/me']);

declare module 'fastify' {
  interface FastifyInstance {
    requireUser: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    // The authenticated user's id — the identity key every per-user route keys on.
    userId?: string;
    // The authenticated user's username, for display/attribution only.
    displayName?: string;
    // The authenticated user, loaded live from the DB by requireUser.
    user?: MeResponse;
  }
}

export const registerAuth = (
  app: FastifyInstance,
  opts: { userService: UserService; sessionSecret: string },
): void => {
  const sc = createSessionCookie(opts.sessionSecret);

  if (!app.hasPlugin('@fastify/cookie')) {
    void app.register(cookie);
  }

  // Decorate the guards BEFORE any route references them as a preHandler — a route's
  // option object is evaluated eagerly, so `preHandler: app.requireUser` would capture
  // `undefined` if the decorator were registered later.
  app.decorate('requireUser', async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.cookies?.[COOKIE_NAME];
    const userId = token ? await sc.verify(token) : null;
    if (!userId) return reply.code(401).send({ error: 'unauthorized' });
    // Load the user live so a deleted account is rejected and an admin reset takes effect
    // on the next request without any token-versioning machinery.
    const user = await opts.userService.findById(userId);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    req.user = { id: user.id, username: user.username, role: user.role, mustChangePassword: user.mustChangePassword };
    req.userId = user.id;
    req.displayName = user.username;
    if (user.mustChangePassword) {
      const path = req.url.split('?')[0] ?? req.url;
      if (!PASSWORD_CHANGE_ALLOWLIST.has(path)) {
        return reply.code(403).send({ error: 'password_change_required' });
      }
    }
  });

  app.decorate('requireAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    await app.requireUser(req, reply);
    if (reply.sent) return; // requireUser already rejected (401/403)
    if (!req.user || !isAdminRole(req.user.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
  });

  app.post('/api/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(401).send({ error: 'invalid credentials' });
    const user = await opts.userService.verifyLogin(parsed.data.username, parsed.data.password);
    if (!user) return reply.code(401).send({ error: 'invalid credentials' });
    const token = await sc.sign(user.id);
    reply.setCookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
    return { id: user.id, username: user.username, role: user.role, mustChangePassword: user.mustChangePassword };
  });

  app.post('/api/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return reply.code(204).send();
  });

  app.get('/api/me', { preHandler: app.requireUser }, async (req) => req.user);

  // Allowed even while `mustChangePassword` is set — that is exactly its job.
  app.post('/api/change-password', { preHandler: app.requireUser }, async (req, reply) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
    }
    try {
      await opts.userService.changePassword(
        req.userId!,
        parsed.data.currentPassword,
        parsed.data.newPassword,
      );
    } catch (err) {
      if (err instanceof UserServiceError && err.code === 'invalid_current') {
        return reply.code(400).send({ error: 'current password is incorrect' });
      }
      throw err;
    }
    return reply.code(204).send();
  });
};
