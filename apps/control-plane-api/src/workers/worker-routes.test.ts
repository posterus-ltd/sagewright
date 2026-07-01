import { describe, expect, it } from 'vitest';

import { fakeWorkerRegistry, makeTestApp } from '../test/make-test-app';

type App = Awaited<ReturnType<typeof makeTestApp>>['app'];

const login = async (app: App, displayName = 'al') => {
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: { displayName, password: 'pw' } });
  const cookie = res.cookies[0];
  return { cookie: `${cookie!.name}=${cookie!.value}` };
};

describe('worker routes', () => {
  it('GET /api/workers returns workers list and config default image when no stored preference', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    const res = await app.inject({ method: 'GET', url: '/api/workers', headers });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.workers).toEqual([{ id: 'w', image: 'w', name: 'W', description: '' }]);
    // config.workerImage is 'w' in makeTestApp
    expect(body.defaultImage).toBe('w');
  });

  it('GET /api/workers returns stored user default when set', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    // Set user default
    await app.inject({
      method: 'PUT',
      url: '/api/settings/default-worker',
      headers,
      payload: { image: 'w' },
    });
    const res = await app.inject({ method: 'GET', url: '/api/workers', headers });
    expect(res.statusCode).toBe(200);
    expect(res.json().defaultImage).toBe('w');
  });

  it('GET /api/workers uses a custom registry override', async () => {
    const { app } = await makeTestApp({
      workerRegistry: fakeWorkerRegistry({
        list: async () => [
          { id: 'custom', image: 'custom:latest', name: 'Custom', description: 'A custom worker' },
        ],
      }),
    });
    const headers = await login(app);
    const res = await app.inject({ method: 'GET', url: '/api/workers', headers });
    expect(res.statusCode).toBe(200);
    expect(res.json().workers).toEqual([
      { id: 'custom', image: 'custom:latest', name: 'Custom', description: 'A custom worker' },
    ]);
  });

  it('requires auth', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/workers' });
    expect(res.statusCode).toBe(401);
  });
});
