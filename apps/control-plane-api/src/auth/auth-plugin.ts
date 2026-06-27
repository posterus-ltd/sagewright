import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { createSessionCookie } from './session-cookie';

const COOKIE_NAME = 'vm_session';

declare module 'fastify' {
  interface FastifyInstance {
    requireUser: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    displayName?: string;
  }
}

export const registerAuth = (
  app: FastifyInstance,
  opts: { appPassword: string; sessionSecret: string },
): void => {
  const sc = createSessionCookie(opts.sessionSecret);

  if (!app.hasPlugin('@fastify/cookie')) {
    void app.register(cookie);
  }

  app.post('/api/login', async (req, reply) => {
    const { displayName, password } = (req.body ?? {}) as {
      displayName?: string;
      password?: string;
    };
    if (!displayName || password !== opts.appPassword) {
      return reply.code(401).send({ error: 'invalid credentials' });
    }
    reply.setCookie(COOKIE_NAME, sc.sign(displayName), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
    return { displayName };
  });

  app.decorate('requireUser', async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.cookies?.[COOKIE_NAME];
    const name = token ? sc.verify(token) : null;
    if (!name) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    req.displayName = name;
  });
};
