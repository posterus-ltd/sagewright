import { describe, expect, it } from 'vitest';

import { fakeRunnerRegistry, makeTestApp } from '../test/make-test-app';

type App = Awaited<ReturnType<typeof makeTestApp>>['app'];

const login = async (app: App, displayName = 'al') => {
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: { username: displayName, password: 'pw' } });
  const cookie = res.cookies[0];
  return { cookie: `${cookie!.name}=${cookie!.value}` };
};

describe('runner routes', () => {
  it('GET /api/runners returns runners list and config default image when no stored preference', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    const res = await app.inject({ method: 'GET', url: '/api/runners', headers });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.runners).toEqual([{ id: 'w', image: 'w', name: 'W', description: '' }]);
    // config.runnerImage is 'w' in makeTestApp
    expect(body.defaultImage).toBe('w');
  });

  it('GET /api/runners returns stored user default when set', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    // Set user default
    await app.inject({
      method: 'PUT',
      url: '/api/settings/default-runner',
      headers,
      payload: { image: 'w' },
    });
    const res = await app.inject({ method: 'GET', url: '/api/runners', headers });
    expect(res.statusCode).toBe(200);
    expect(res.json().defaultImage).toBe('w');
  });

  it('GET /api/runners uses a custom registry override', async () => {
    const { app } = await makeTestApp({
      runnerRegistry: fakeRunnerRegistry({
        list: async () => [
          { id: 'custom', image: 'custom:latest', name: 'Custom', description: 'A custom runner' },
        ],
      }),
    });
    const headers = await login(app);
    const res = await app.inject({ method: 'GET', url: '/api/runners', headers });
    expect(res.statusCode).toBe(200);
    expect(res.json().runners).toEqual([
      { id: 'custom', image: 'custom:latest', name: 'Custom', description: 'A custom runner' },
    ]);
  });

  it('requires auth', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/runners' });
    expect(res.statusCode).toBe(401);
  });
});
