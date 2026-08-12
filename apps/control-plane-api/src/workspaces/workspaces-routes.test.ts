import { EMPTY_WORKSPACES } from '@sagewright/shared';
import { describe, expect, it } from 'vitest';

import { makeTestApp } from '../test/make-test-app';

type App = Awaited<ReturnType<typeof makeTestApp>>['app'];

const login = async (app: App, displayName = 'al') => {
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: { username: displayName, password: 'pw' } });
  const cookie = res.cookies[0];
  return { cookie: `${cookie!.name}=${cookie!.value}` };
};

const sampleBlob = {
  workspaces: [
    {
      id: 'w1',
      name: 'Reviews',
      tree: {
        direction: 'row' as const,
        first: 's1',
        second: { direction: 'column' as const, first: 's2', second: 'empty:slot', splitPercentage: 60 },
        splitPercentage: 40,
      },
    },
    { id: 'w2', name: 'Empty', tree: null },
  ],
  activeWorkspaceId: 'w1',
};

describe('workspaces routes', () => {
  it('returns an empty blob when nothing is stored', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    // The GET response carries `updatedAt` (null when never saved) on top of the blob.
    expect((await app.inject({ method: 'GET', url: '/api/workspaces', headers })).json()).toEqual({ ...EMPTY_WORKSPACES, updatedAt: null });
  });

  it('stores workspaces and returns them', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    const put = await app.inject({ method: 'PUT', url: '/api/workspaces', headers, payload: sampleBlob });
    expect(put.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/workspaces', headers })).json()).toEqual({ ...sampleBlob, updatedAt: expect.any(String) });
  });

  it('upserts (a second PUT replaces the blob)', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    await app.inject({ method: 'PUT', url: '/api/workspaces', headers, payload: sampleBlob });
    const next = { workspaces: [{ id: 'w3', name: 'Solo', tree: 's9' }], activeWorkspaceId: 'w3' };
    await app.inject({ method: 'PUT', url: '/api/workspaces', headers, payload: next });
    expect((await app.inject({ method: 'GET', url: '/api/workspaces', headers })).json()).toEqual({ ...next, updatedAt: expect.any(String) });
  });

  it("keeps each user's workspaces separate", async () => {
    const { app } = await makeTestApp();
    const al = await login(app, 'al');
    const bo = await login(app, 'bo');
    await app.inject({ method: 'PUT', url: '/api/workspaces', headers: al, payload: sampleBlob });
    expect((await app.inject({ method: 'GET', url: '/api/workspaces', headers: bo })).json()).toEqual({ ...EMPTY_WORKSPACES, updatedAt: null });
  });

  it('rejects a malformed body', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    const res = await app.inject({ method: 'PUT', url: '/api/workspaces', headers, payload: { workspaces: 'nope' } });
    expect(res.statusCode).toBe(400);
  });

  it('requires auth', async () => {
    const { app } = await makeTestApp();
    expect((await app.inject({ method: 'GET', url: '/api/workspaces' })).statusCode).toBe(401);
  });
});
