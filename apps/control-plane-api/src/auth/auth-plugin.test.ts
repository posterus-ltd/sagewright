import { UserRole } from '@sagewright/shared';
import { describe, expect, it } from 'vitest';

import { login, makeTestApp } from '../test/make-test-app';

// A realistic wiring: root + a plain user (no forced change) + a freshly-provisioned
// user who must change their password before the app opens up.
const seedUsers = [
  { username: 'root', role: UserRole.ROOT },
  { username: 'al', role: UserRole.USER },
  { username: 'newbie', role: UserRole.USER, mustChangePassword: true },
];

describe('auth-plugin', () => {
  it('rejects unauthenticated access', async () => {
    const { app } = await makeTestApp({}, { seedUsers });
    expect((await app.inject({ method: 'GET', url: '/api/me' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/repos' })).statusCode).toBe(401);
  });

  it('logs in and reports identity via /api/me', async () => {
    const { app, userId } = await makeTestApp({}, { seedUsers });
    const headers = await login(app, 'al');
    const me = await app.inject({ method: 'GET', url: '/api/me', headers });
    expect(me.json()).toEqual({ id: userId('al'), username: 'al', role: 'user', mustChangePassword: false });
  });

  it('rejects a wrong password and an unknown user with 401', async () => {
    const { app } = await makeTestApp({}, { seedUsers });
    expect((await app.inject({ method: 'POST', url: '/api/login', payload: { username: 'al', password: 'nope' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/login', payload: { username: 'ghost', password: 'pw' } })).statusCode).toBe(401);
  });

  it('gates the app behind the forced-change screen when mustChangePassword is set', async () => {
    const { app } = await makeTestApp({}, { seedUsers });
    const headers = await login(app, 'newbie');

    // A normal guarded route is blocked with a machine-readable code…
    const blocked = await app.inject({ method: 'GET', url: '/api/repos', headers });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toEqual({ error: 'password_change_required' });

    // …but the allowlist (me / change-password / logout) stays reachable.
    expect((await app.inject({ method: 'GET', url: '/api/me', headers })).statusCode).toBe(200);

    const changed = await app.inject({
      method: 'POST',
      url: '/api/change-password',
      headers,
      payload: { currentPassword: 'pw', newPassword: 'a-brand-new-pass1' },
    });
    expect(changed.statusCode).toBe(204);

    // The live DB check means the gate lifts on the very next request.
    expect((await app.inject({ method: 'GET', url: '/api/repos', headers })).statusCode).toBe(200);
  });

  it('rejects a wrong current password on change-password with 400', async () => {
    const { app } = await makeTestApp({}, { seedUsers });
    const headers = await login(app, 'al');
    const res = await app.inject({
      method: 'POST',
      url: '/api/change-password',
      headers,
      payload: { currentPassword: 'wrong', newPassword: 'a-brand-new-pass1' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a new password that does not meet the requirements with 400', async () => {
    const { app } = await makeTestApp({}, { seedUsers });
    const headers = await login(app, 'al');
    // Long enough but no digit — must be rejected server-side regardless of the client.
    const res = await app.inject({
      method: 'POST',
      url: '/api/change-password',
      headers,
      payload: { currentPassword: 'pw', newPassword: 'letters-only-here' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('requireAdmin forbids a plain user but admits root', async () => {
    const { app } = await makeTestApp({}, { seedUsers });
    expect((await app.inject({ method: 'GET', url: '/api/users', headers: await login(app, 'al') })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/users', headers: await login(app, 'root') })).statusCode).toBe(200);
  });

  it('logout expires the session cookie', async () => {
    const { app } = await makeTestApp({}, { seedUsers });
    const res = await app.inject({ method: 'POST', url: '/api/logout' });
    expect(res.statusCode).toBe(204);
    const cleared = res.cookies.find((c) => c.name === 'vm_session');
    expect(cleared?.value).toBe('');
  });
});
