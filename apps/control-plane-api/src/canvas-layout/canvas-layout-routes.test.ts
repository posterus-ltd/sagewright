import { EMPTY_CANVAS_LAYOUT } from '@sagewright/shared';
import { describe, expect, it } from 'vitest';

import { makeTestApp } from '../test/make-test-app';

type App = Awaited<ReturnType<typeof makeTestApp>>['app'];

const login = async (app: App, displayName = 'al') => {
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: { displayName, password: 'pw' } });
  const cookie = res.cookies[0];
  return { cookie: `${cookie!.name}=${cookie!.value}` };
};

const sampleLayout = {
  placements: [{ sessionId: 's1', x: 10, y: 20, width: 400, height: 300 }],
  viewport: { x: -5, y: 8, zoom: 1.25 },
};

describe('canvas-layout routes', () => {
  it('returns an empty layout when nothing is stored', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    expect((await app.inject({ method: 'GET', url: '/api/canvas-layout', headers })).json()).toEqual(EMPTY_CANVAS_LAYOUT);
  });

  it('stores a layout and returns it', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    const put = await app.inject({ method: 'PUT', url: '/api/canvas-layout', headers, payload: sampleLayout });
    expect(put.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/canvas-layout', headers })).json()).toEqual(sampleLayout);
  });

  it('upserts (a second PUT replaces the layout)', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    await app.inject({ method: 'PUT', url: '/api/canvas-layout', headers, payload: sampleLayout });
    const next = { placements: [], viewport: { x: 0, y: 0, zoom: 2 } };
    await app.inject({ method: 'PUT', url: '/api/canvas-layout', headers, payload: next });
    expect((await app.inject({ method: 'GET', url: '/api/canvas-layout', headers })).json()).toEqual(next);
  });

  it('keeps each user\'s layout separate', async () => {
    const { app } = await makeTestApp();
    const al = await login(app, 'al');
    const bo = await login(app, 'bo');
    await app.inject({ method: 'PUT', url: '/api/canvas-layout', headers: al, payload: sampleLayout });
    expect((await app.inject({ method: 'GET', url: '/api/canvas-layout', headers: bo })).json()).toEqual(EMPTY_CANVAS_LAYOUT);
  });

  it('rejects a malformed body', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    const res = await app.inject({ method: 'PUT', url: '/api/canvas-layout', headers, payload: { placements: 'nope' } });
    expect(res.statusCode).toBe(400);
  });

  it('requires auth', async () => {
    const { app } = await makeTestApp();
    expect((await app.inject({ method: 'GET', url: '/api/canvas-layout' })).statusCode).toBe(401);
  });
});
