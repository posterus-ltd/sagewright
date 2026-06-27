import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { registerAuth } from './auth-plugin';

const build = () => {
  const app = Fastify();
  registerAuth(app, { appPassword: 'pw', sessionSecret: 'sec' });
  app.get('/api/ping', { preHandler: app.requireUser }, async (req) => ({ user: req.displayName }));
  return app;
};

describe('auth-plugin', () => {
  it('rejects unauthenticated access', async () => {
    const res = await build().inject({ method: 'GET', url: '/api/ping' });
    expect(res.statusCode).toBe(401);
  });
  it('logs in and accesses a guarded route', async () => {
    const app = build();
    const login = await app.inject({ method: 'POST', url: '/api/login', payload: { displayName: 'al', password: 'pw' } });
    expect(login.statusCode).toBe(200);
    const cookie = login.cookies[0];
    const ping = await app.inject({ method: 'GET', url: '/api/ping', cookies: { [cookie.name]: cookie.value } });
    expect(ping.json()).toEqual({ user: 'al' });
  });
});
