import type { User } from '@sagewright/shared';
import { describe, expect, it } from 'vitest';

import { login, makeTestApp } from '../test/make-test-app';

// makeTestApp seeds root + al/bo/alice/bob/mallory (all plain users, no forced change).

describe('user routes', () => {
  it('lists users for an admin and forbids a plain user', async () => {
    const { app } = await makeTestApp();
    const asRoot = await login(app, 'root');
    const asUser = await login(app, 'al');

    const listed = await app.inject({ method: 'GET', url: '/api/users', headers: asRoot });
    expect(listed.statusCode).toBe(200);
    expect((listed.json() as User[]).map((u) => u.username)).toContain('al');

    expect((await app.inject({ method: 'GET', url: '/api/users', headers: asUser })).statusCode).toBe(403);
  });

  it('creates a user and returns a one-time password once', async () => {
    const { app } = await makeTestApp();
    const asRoot = await login(app, 'root');
    const res = await app.inject({ method: 'POST', url: '/api/users', headers: asRoot, payload: { username: 'carol' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ username: 'carol', role: 'user' });
    expect(res.json().initialPassword).toBeTruthy();

    // The created user can log in with the shared password (and is forced to change it).
    expect((await app.inject({ method: 'POST', url: '/api/login', payload: { username: 'carol', password: res.json().initialPassword } })).statusCode).toBe(200);
  });

  it('creates an admin when a role is supplied', async () => {
    const { app } = await makeTestApp();
    const asRoot = await login(app, 'root');
    const res = await app.inject({ method: 'POST', url: '/api/users', headers: asRoot, payload: { username: 'dave', role: 'admin' } });
    expect(res.json()).toMatchObject({ username: 'dave', role: 'admin' });
  });

  it('rejects creating a duplicate username with 409', async () => {
    const { app } = await makeTestApp();
    const asRoot = await login(app, 'root');
    const res = await app.inject({ method: 'POST', url: '/api/users', headers: asRoot, payload: { username: 'al' } });
    expect(res.statusCode).toBe(409);
  });

  it('resets a password (forcing a change) but never for root', async () => {
    const { app, userId } = await makeTestApp();
    const asRoot = await login(app, 'root');
    const reset = await app.inject({ method: 'POST', url: `/api/users/${userId('al')}/reset-password`, headers: asRoot });
    expect(reset.statusCode).toBe(200);
    expect(reset.json()).toMatchObject({ username: 'al' });
    expect(reset.json().initialPassword).toBeTruthy();

    const listed = (await app.inject({ method: 'GET', url: '/api/users', headers: asRoot })).json() as User[];
    expect(listed.find((u) => u.username === 'al')?.mustChangePassword).toBe(true);

    expect((await app.inject({ method: 'POST', url: `/api/users/${userId('root')}/reset-password`, headers: asRoot })).statusCode).toBe(403);
  });

  it('promotes and demotes via PATCH, protecting root and rejecting an invalid role', async () => {
    const { app, userId } = await makeTestApp();
    const asRoot = await login(app, 'root');

    expect((await app.inject({ method: 'PATCH', url: `/api/users/${userId('al')}`, headers: asRoot, payload: { role: 'admin' } })).statusCode).toBe(204);
    const listed = (await app.inject({ method: 'GET', url: '/api/users', headers: asRoot })).json() as User[];
    expect(listed.find((u) => u.username === 'al')?.role).toBe('admin');

    expect((await app.inject({ method: 'PATCH', url: `/api/users/${userId('root')}`, headers: asRoot, payload: { role: 'admin' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PATCH', url: `/api/users/${userId('al')}`, headers: asRoot, payload: { role: 'root' } })).statusCode).toBe(400);
  });

  it('deletes a user, protecting root and self', async () => {
    const { app, userId } = await makeTestApp();
    const asRoot = await login(app, 'root');

    expect((await app.inject({ method: 'DELETE', url: `/api/users/${userId('bo')}`, headers: asRoot })).statusCode).toBe(204);
    const listed = (await app.inject({ method: 'GET', url: '/api/users', headers: asRoot })).json() as User[];
    expect(listed.map((u) => u.username)).not.toContain('bo');

    // Root cannot be deleted (it is also root's own account here → self + root protected).
    expect((await app.inject({ method: 'DELETE', url: `/api/users/${userId('root')}`, headers: asRoot })).statusCode).toBe(403);

    // An admin cannot delete themselves.
    await app.inject({ method: 'PATCH', url: `/api/users/${userId('alice')}`, headers: asRoot, payload: { role: 'admin' } });
    const asAlice = await login(app, 'alice');
    expect((await app.inject({ method: 'DELETE', url: `/api/users/${userId('alice')}`, headers: asAlice })).statusCode).toBe(403);
  });

  it('forbids all writes for a non-admin', async () => {
    const { app, userId } = await makeTestApp();
    const asUser = await login(app, 'al');
    expect((await app.inject({ method: 'POST', url: '/api/users', headers: asUser, payload: { username: 'x1abc' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/api/users/${userId('bo')}/reset-password`, headers: asUser })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PATCH', url: `/api/users/${userId('bo')}`, headers: asUser, payload: { role: 'admin' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/api/users/${userId('bo')}`, headers: asUser })).statusCode).toBe(403);
  });
});
