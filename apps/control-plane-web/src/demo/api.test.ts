import { SessionKind, SessionStatus, type MeResponse, type Session } from '@sagewright/shared';
import { describe, expect, it } from 'vitest';

import { createDemoApiClient } from './api';
import { DEMO_RUN_ID, DEMO_USER, HERO_SESSION_ID } from './mock-data';
import { createDemoStore } from './store';

const client = () => createDemoApiClient(createDemoStore());

describe('demo api client', () => {
  it('returns the demo user for /api/me', async () => {
    const me = await client().get<MeResponse>('/api/me');
    expect(me).toEqual(DEMO_USER);
  });

  it('graph returns every session; /api/tasks returns only standalone ones', async () => {
    const c = client();
    const graph = await c.get<Session[]>('/api/tasks/graph');
    const standalone = await c.get<Session[]>('/api/tasks?mine=1');
    // The workflow parent + step sessions are in the graph but not the sessions list.
    expect(graph.length).toBeGreaterThan(standalone.length);
    expect(graph.some((s) => s.id === DEMO_RUN_ID && s.kind === SessionKind.WORKFLOW)).toBe(true);
    expect(standalone.some((s) => s.kind === SessionKind.WORKFLOW)).toBe(false);
    expect(standalone.some((s) => s.id === HERO_SESSION_ID)).toBe(true);
  });

  it('creates a queued session on POST /api/tasks and stores it', async () => {
    const store = createDemoStore();
    const created = await createDemoApiClient(store).post<Session>('/api/tasks', { prompt: 'demo task' });
    expect(created.status).toBe(SessionStatus.QUEUED);
    expect(created.prompt).toBe('demo task');
    expect(store.sessions.find((s) => s.id === created.id)).toBeTruthy();
  });

  it('marks a session stopped on POST /api/tasks/:id/stop', async () => {
    const store = createDemoStore();
    await createDemoApiClient(store).post(`/api/tasks/${HERO_SESSION_ID}/stop`);
    expect(store.sessions.find((s) => s.id === HERO_SESSION_ID)?.status).toBe(SessionStatus.STOPPED);
  });

  it('resolves benign undefined for an unknown route (never throws)', async () => {
    await expect(client().get('/api/does-not-exist')).resolves.toBeUndefined();
  });
});
