import { describe, expect, it, vi } from 'vitest';

import { makeTestApp } from '../test/make-test-app';

type App = Awaited<ReturnType<typeof makeTestApp>>['app'];

const login = async (app: App, displayName = 'al') => {
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: { displayName, password: 'pw' } });
  const cookie = res.cookies[0];
  return { cookie: `${cookie.name}=${cookie.value}` };
};

describe('github routes', () => {
  it('returns status, stores a PAT, and disconnects without exposing the token', async () => {
    const githubCredentialService = {
      getStatus: vi
        .fn()
        .mockResolvedValueOnce({ connected: false })
        .mockResolvedValueOnce({ connected: true, login: 'octo', scopes: ['repo'], missingRepoScope: false }),
      validateAndStore: vi.fn(async () => ({ identity: { login: 'octo', name: null, email: 'octo@example.com' }, scopes: ['repo'], missingRepoScope: false })),
      disconnect: vi.fn(async () => undefined),
      resolve: vi.fn(),
    };
    const { app } = await makeTestApp({ githubCredentialService: githubCredentialService as never });
    const headers = await login(app);

    expect((await app.inject({ method: 'GET', url: '/api/github/status', headers })).json()).toEqual({ connected: false });

    const put = await app.inject({ method: 'PUT', url: '/api/github/token', headers, payload: { token: 'ghp_user' } });
    expect(put.statusCode).toBe(200);
    expect(put.json()).not.toHaveProperty('token');
    expect(githubCredentialService.validateAndStore).toHaveBeenCalledWith('al', 'ghp_user', 'pat');

    expect((await app.inject({ method: 'GET', url: '/api/github/status', headers })).json()).toMatchObject({
      connected: true,
      login: 'octo',
    });

    const del = await app.inject({ method: 'DELETE', url: '/api/github', headers });
    expect(del.statusCode).toBe(204);
    expect(githubCredentialService.disconnect).toHaveBeenCalledWith('al');
  });

  it('rejects malformed bodies and requires auth', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);

    expect((await app.inject({ method: 'PUT', url: '/api/github/token', headers, payload: { nope: true } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/github/status' })).statusCode).toBe(401);
  });
});
