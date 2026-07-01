import { describe, expect, it } from 'vitest';

import { fakeWorkerRegistry, makeTestApp } from '../test/make-test-app';

type App = Awaited<ReturnType<typeof makeTestApp>>['app'];

const login = async (app: App, displayName = 'al') => {
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: { displayName, password: 'pw' } });
  const cookie = res.cookies[0];
  return { cookie: `${cookie!.name}=${cookie!.value}` };
};

describe('user-settings routes', () => {
  it('GET returns config default when no preference stored', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    const res = await app.inject({ method: 'GET', url: '/api/settings/default-worker', headers });
    expect(res.statusCode).toBe(200);
    // config.workerImage is 'w' in makeTestApp
    expect(res.json()).toEqual({ defaultImage: 'w' });
  });

  it('PUT valid image then GET returns the stored value', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    const put = await app.inject({
      method: 'PUT',
      url: '/api/settings/default-worker',
      headers,
      payload: { image: 'w' },
    });
    expect(put.statusCode).toBe(204);

    const get = await app.inject({ method: 'GET', url: '/api/settings/default-worker', headers });
    expect(get.json()).toEqual({ defaultImage: 'w' });
  });

  it('PUT upserts — second PUT replaces the stored value', async () => {
    // Need a registry that lists two images
    const { app } = await makeTestApp({
      workerRegistry: fakeWorkerRegistry({
        list: async () => [
          { id: 'first', image: 'first:latest', name: 'First', description: '' },
          { id: 'second', image: 'second:latest', name: 'Second', description: '' },
        ],
      }),
    });
    const headers = await login(app);
    await app.inject({ method: 'PUT', url: '/api/settings/default-worker', headers, payload: { image: 'first:latest' } });
    await app.inject({ method: 'PUT', url: '/api/settings/default-worker', headers, payload: { image: 'second:latest' } });
    const get = await app.inject({ method: 'GET', url: '/api/settings/default-worker', headers });
    expect(get.json()).toEqual({ defaultImage: 'second:latest' });
  });

  it('keeps each user\'s preference separate', async () => {
    const { app } = await makeTestApp({
      workerRegistry: fakeWorkerRegistry({
        list: async () => [
          { id: 'a', image: 'img-a:latest', name: 'A', description: '' },
          { id: 'b', image: 'img-b:latest', name: 'B', description: '' },
        ],
      }),
    });
    const al = await login(app, 'al');
    const bo = await login(app, 'bo');
    await app.inject({ method: 'PUT', url: '/api/settings/default-worker', headers: al, payload: { image: 'img-a:latest' } });
    await app.inject({ method: 'PUT', url: '/api/settings/default-worker', headers: bo, payload: { image: 'img-b:latest' } });
    expect((await app.inject({ method: 'GET', url: '/api/settings/default-worker', headers: al })).json()).toEqual({ defaultImage: 'img-a:latest' });
    expect((await app.inject({ method: 'GET', url: '/api/settings/default-worker', headers: bo })).json()).toEqual({ defaultImage: 'img-b:latest' });
  });

  it('PUT image NOT in registry returns 400', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/settings/default-worker',
      headers,
      payload: { image: 'unknown:latest' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('unknown worker image');
  });

  it('PUT with empty string returns 400', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/settings/default-worker',
      headers,
      payload: { image: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('image must be a non-empty string');
  });

  it('PUT without image field returns 400', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/settings/default-worker',
      headers,
      payload: { notImage: 'w' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET requires auth', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/settings/default-worker' });
    expect(res.statusCode).toBe(401);
  });

  it('PUT requires auth', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({ method: 'PUT', url: '/api/settings/default-worker', payload: { image: 'w' } });
    expect(res.statusCode).toBe(401);
  });
});
