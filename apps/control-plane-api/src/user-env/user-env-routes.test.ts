import { describe, expect, it } from 'vitest';

import { makeTestApp } from '../test/make-test-app';

type App = Awaited<ReturnType<typeof makeTestApp>>['app'];

const login = async (app: App, displayName = 'al') => {
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: { displayName, password: 'pw' } });
  const cookie = res.cookies[0];
  return { cookie: `${cookie.name}=${cookie.value}` };
};

describe('user-env routes', () => {
  it('stores a blob and returns it masked, with values visible only via reveal', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);

    const put = await app.inject({
      method: 'PUT',
      url: '/api/user-env',
      headers,
      payload: { env: '# mine\nGITHUB_TOKEN=ghp_secret' },
    });
    expect(put.statusCode).toBe(204);

    const masked = await app.inject({ method: 'GET', url: '/api/user-env', headers });
    expect(masked.json()).toEqual({ env: '# mine\nGITHUB_TOKEN=*******' });

    const revealed = await app.inject({ method: 'GET', url: '/api/user-env/reveal', headers });
    expect(revealed.json()).toEqual({ env: '# mine\nGITHUB_TOKEN=ghp_secret' });
  });

  it('upserts (a second PUT replaces the blob)', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    await app.inject({ method: 'PUT', url: '/api/user-env', headers, payload: { env: 'A=1' } });
    await app.inject({ method: 'PUT', url: '/api/user-env', headers, payload: { env: 'B=2' } });
    const revealed = await app.inject({ method: 'GET', url: '/api/user-env/reveal', headers });
    expect(revealed.json()).toEqual({ env: 'B=2' });
  });

  it('keeps each user\'s blob separate', async () => {
    const { app } = await makeTestApp();
    const al = await login(app, 'al');
    const bo = await login(app, 'bo');
    await app.inject({ method: 'PUT', url: '/api/user-env', headers: al, payload: { env: 'WHO=al' } });
    await app.inject({ method: 'PUT', url: '/api/user-env', headers: bo, payload: { env: 'WHO=bo' } });
    expect((await app.inject({ method: 'GET', url: '/api/user-env/reveal', headers: al })).json()).toEqual({ env: 'WHO=al' });
    expect((await app.inject({ method: 'GET', url: '/api/user-env/reveal', headers: bo })).json()).toEqual({ env: 'WHO=bo' });
  });

  it('returns an empty string when nothing is stored', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    expect((await app.inject({ method: 'GET', url: '/api/user-env', headers })).json()).toEqual({ env: '' });
  });

  it('rejects a malformed body', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    const res = await app.inject({ method: 'PUT', url: '/api/user-env', headers, payload: { notEnv: 1 } });
    expect(res.statusCode).toBe(400);
  });

  it('requires auth', async () => {
    const { app } = await makeTestApp();
    expect((await app.inject({ method: 'GET', url: '/api/user-env' })).statusCode).toBe(401);
  });
});
