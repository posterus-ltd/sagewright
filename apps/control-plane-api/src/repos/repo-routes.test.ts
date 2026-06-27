import { describe, expect, it } from 'vitest';

import { slugFromUrl } from '../git/volume';
import { fakeVolume, makeTestApp } from '../test/make-test-app';

const appWithVolume = () => makeTestApp({ volume: fakeVolume({ slugFromUrl }) });

const login = async (app: Awaited<ReturnType<typeof makeTestApp>>['app'], displayName = 'al') => {
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: { displayName, password: 'pw' } });
  const cookie = res.cookies[0];
  return { cookie: `${cookie.name}=${cookie.value}` };
};

const put = (app: Awaited<ReturnType<typeof makeTestApp>>['app'], headers: { cookie: string }, urls: string[]) =>
  app.inject({ method: 'PUT', url: '/api/repos', headers, payload: { urls } });

describe('repo routes', () => {
  it('saves a URL list and lists the repos with status', async () => {
    const { app } = await appWithVolume();
    const headers = await login(app);

    const saved = await app.inject({
      method: 'PUT',
      url: '/api/repos',
      headers,
      payload: { urls: ['https://github.com/acme/a', 'https://github.com/acme/b'] },
    });
    expect(saved.statusCode).toBe(200);
    const body = saved.json() as { slug: string; status: string }[];
    expect(body.map((r) => r.slug).sort()).toEqual(['acme-a', 'acme-b']);
    expect(body.every((r) => r.status === 'present')).toBe(true);

    const list = await app.inject({ method: 'GET', url: '/api/repos', headers });
    expect(list.json()).toHaveLength(2);
  });

  it('removes repos dropped from the list', async () => {
    const { app } = await appWithVolume();
    const headers = await login(app);

    await app.inject({
      method: 'PUT',
      url: '/api/repos',
      headers,
      payload: { urls: ['https://github.com/acme/a', 'https://github.com/acme/b'] },
    });
    const after = await app.inject({
      method: 'PUT',
      url: '/api/repos',
      headers,
      payload: { urls: ['https://github.com/acme/a'] },
    });
    const body = after.json() as { slug: string }[];
    expect(body.map((r) => r.slug)).toEqual(['acme-a']);
  });

  it('is idempotent for an unchanged list', async () => {
    const { app } = await appWithVolume();
    const headers = await login(app);
    const payload = { urls: ['https://github.com/acme/a'] };
    await app.inject({ method: 'PUT', url: '/api/repos', headers, payload });
    const again = await app.inject({ method: 'PUT', url: '/api/repos', headers, payload });
    expect((again.json() as unknown[]).length).toBe(1);
  });

  it('keeps each user\'s repo list separate', async () => {
    const { app } = await appWithVolume();
    const al = await login(app, 'al');
    const bo = await login(app, 'bo');

    await put(app, al, ['https://github.com/acme/a']);
    await put(app, bo, ['https://github.com/acme/b']);

    const alList = (await app.inject({ method: 'GET', url: '/api/repos', headers: al })).json() as { slug: string }[];
    const boList = (await app.inject({ method: 'GET', url: '/api/repos', headers: bo })).json() as { slug: string }[];
    expect(alList.map((r) => r.slug)).toEqual(['acme-a']);
    expect(boList.map((r) => r.slug)).toEqual(['acme-b']);
  });

  it('passes the user\'s stored GITHUB_TOKEN override to the volume reconcile', async () => {
    const reconcileTokens: (string | undefined)[] = [];
    const { app } = await makeTestApp({
      volume: fakeVolume({ slugFromUrl, reconcile: (_repos, token) => void reconcileTokens.push(token) }),
    });
    const headers = await login(app);

    // No override yet → reconcile falls back to the operator token (undefined here).
    await put(app, headers, ['https://github.com/acme/a']);
    expect(reconcileTokens.at(-1)).toBeUndefined();

    // Store a personal token, then save again → the user's token drives the clone.
    await app.inject({ method: 'PUT', url: '/api/user-env', headers, payload: { env: 'GITHUB_TOKEN=ghp_user' } });
    await put(app, headers, ['https://github.com/acme/a', 'https://github.com/acme/b']);
    expect(reconcileTokens.at(-1)).toBe('ghp_user');
  });

  it('only removes the shared clone once no other user references the slug', async () => {
    const removed: string[] = [];
    const { app } = await makeTestApp({
      volume: fakeVolume({ slugFromUrl, removeRepo: async (slug) => void removed.push(slug) }),
    });
    const al = await login(app, 'al');
    const bo = await login(app, 'bo');

    // Both users configure the same repo → one shared clone (slug 'acme-a').
    await put(app, al, ['https://github.com/acme/a']);
    await put(app, bo, ['https://github.com/acme/a']);

    // al drops it: bo still references the slug, so the clone must survive.
    await put(app, al, []);
    expect(removed).toEqual([]);

    // bo drops it too: now nobody references it, so the clone is removed.
    await put(app, bo, []);
    expect(removed).toEqual(['acme-a']);
  });
});
