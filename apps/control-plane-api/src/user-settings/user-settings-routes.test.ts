import { describe, expect, it } from 'vitest';

import { fakeRunnerRegistry, makeTestApp } from '../test/make-test-app';

type App = Awaited<ReturnType<typeof makeTestApp>>['app'];

const login = async (app: App, displayName = 'al') => {
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: { username: displayName, password: 'pw' } });
  const cookie = res.cookies[0];
  return { cookie: `${cookie!.name}=${cookie!.value}` };
};

describe('user-settings routes', () => {
  it('GET returns the defaults when nothing is stored', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    const res = await app.inject({ method: 'GET', url: '/api/settings', headers });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ defaultRunnerImage: null, mcpEnabled: true, maxActiveSessions: 25 });
  });

  it('PATCH returns the merged settings and GET reflects them', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    const patch = await app.inject({ method: 'PATCH', url: '/api/settings', headers, payload: { defaultRunnerImage: 'w' } });
    expect(patch.statusCode).toBe(200);
    expect(patch.json()).toEqual({ defaultRunnerImage: 'w', mcpEnabled: true, maxActiveSessions: 25 });

    const get = await app.inject({ method: 'GET', url: '/api/settings', headers });
    expect(get.json()).toEqual({ defaultRunnerImage: 'w', mcpEnabled: true, maxActiveSessions: 25 });
  });

  it('PATCH updates only the provided keys, leaving the others untouched', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    await app.inject({ method: 'PATCH', url: '/api/settings', headers, payload: { defaultRunnerImage: 'w' } });
    // Toggling MCP must not clobber the stored runner image.
    const patch = await app.inject({ method: 'PATCH', url: '/api/settings', headers, payload: { mcpEnabled: false } });
    expect(patch.json()).toEqual({ defaultRunnerImage: 'w', mcpEnabled: false, maxActiveSessions: 25 });
  });

  it('PATCH is an upsert — a later value replaces the earlier one', async () => {
    const { app } = await makeTestApp({
      runnerRegistry: fakeRunnerRegistry({
        list: async () => [
          { id: 'first', image: 'first:latest', name: 'First', description: '' },
          { id: 'second', image: 'second:latest', name: 'Second', description: '' },
        ],
      }),
    });
    const headers = await login(app);
    await app.inject({ method: 'PATCH', url: '/api/settings', headers, payload: { defaultRunnerImage: 'first:latest' } });
    await app.inject({ method: 'PATCH', url: '/api/settings', headers, payload: { defaultRunnerImage: 'second:latest' } });
    const get = await app.inject({ method: 'GET', url: '/api/settings', headers });
    expect(get.json().defaultRunnerImage).toBe('second:latest');
  });

  it('PATCH defaultRunnerImage: null resets to the operator default', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    await app.inject({ method: 'PATCH', url: '/api/settings', headers, payload: { defaultRunnerImage: 'w' } });
    const patch = await app.inject({ method: 'PATCH', url: '/api/settings', headers, payload: { defaultRunnerImage: null } });
    expect(patch.json().defaultRunnerImage).toBeNull();
  });

  it('PATCH with an empty body is a no-op that returns current settings', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    const res = await app.inject({ method: 'PATCH', url: '/api/settings', headers, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ defaultRunnerImage: null, mcpEnabled: true, maxActiveSessions: 25 });
  });

  it('keeps each user\'s settings separate', async () => {
    const { app } = await makeTestApp({
      runnerRegistry: fakeRunnerRegistry({
        list: async () => [
          { id: 'a', image: 'img-a:latest', name: 'A', description: '' },
          { id: 'b', image: 'img-b:latest', name: 'B', description: '' },
        ],
      }),
    });
    const al = await login(app, 'al');
    const bo = await login(app, 'bo');
    await app.inject({ method: 'PATCH', url: '/api/settings', headers: al, payload: { defaultRunnerImage: 'img-a:latest', mcpEnabled: false, maxActiveSessions: 25 } });
    await app.inject({ method: 'PATCH', url: '/api/settings', headers: bo, payload: { defaultRunnerImage: 'img-b:latest' } });
    expect((await app.inject({ method: 'GET', url: '/api/settings', headers: al })).json()).toEqual({ defaultRunnerImage: 'img-a:latest', mcpEnabled: false, maxActiveSessions: 25 });
    expect((await app.inject({ method: 'GET', url: '/api/settings', headers: bo })).json()).toEqual({ defaultRunnerImage: 'img-b:latest', mcpEnabled: true, maxActiveSessions: 25 });
  });

  it('PATCH a runner image NOT in the registry returns 400', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    const res = await app.inject({ method: 'PATCH', url: '/api/settings', headers, payload: { defaultRunnerImage: 'unknown:latest' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('unknown runner image');
  });

  it('PATCH an empty-string runner image returns 400', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    const res = await app.inject({ method: 'PATCH', url: '/api/settings', headers, payload: { defaultRunnerImage: '' } });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH a non-boolean mcpEnabled returns 400', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    const res = await app.inject({ method: 'PATCH', url: '/api/settings', headers, payload: { mcpEnabled: 'nope' } });
    expect(res.statusCode).toBe(400);
  });

  it('GET requires auth', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.statusCode).toBe(401);
  });

  it('PATCH requires auth', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({ method: 'PATCH', url: '/api/settings', payload: { mcpEnabled: false } });
    expect(res.statusCode).toBe(401);
  });
});
