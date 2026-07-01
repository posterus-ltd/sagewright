import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { scheduledPrompts, sessions } from '../db/schema';
import { fakeScheduler, fakeWorkerRegistry, makeTestApp } from '../test/make-test-app';

const login = async (app: Awaited<ReturnType<typeof makeTestApp>>['app']) => {
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: { displayName: 'al', password: 'pw' } });
  const cookie = res.cookies[0];
  return { cookie: `${cookie!.name}=${cookie!.value}` };
};

describe('scheduled-prompt routes', () => {
  it('creates, lists, and deletes a scheduled prompt', async () => {
    const sync = vi.fn(async () => undefined);
    const { app } = await makeTestApp({ scheduler: fakeScheduler({ sync }) });
    const headers = await login(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/scheduled-prompts',
      headers,
      payload: { cron: '0 9 * * *', prompt: 'daily triage' },
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json() as { id: string };
    expect(sync).toHaveBeenCalled();

    const list = await app.inject({ method: 'GET', url: '/api/scheduled-prompts', headers });
    expect(list.json()).toHaveLength(1);

    const del = await app.inject({ method: 'DELETE', url: `/api/scheduled-prompts/${id}`, headers });
    expect(del.statusCode).toBe(204);
    const after = await app.inject({ method: 'GET', url: '/api/scheduled-prompts', headers });
    expect(after.json()).toHaveLength(0);
  });

  it('persists and returns the chosen workerImage', async () => {
    const { app } = await makeTestApp({
      scheduler: fakeScheduler(),
      workerRegistry: fakeWorkerRegistry({
        list: async () => [{ id: 'codex', image: 'sagewright-worker-codex:latest', name: 'Codex', description: '' }],
      }),
    });
    const headers = await login(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/scheduled-prompts',
      headers,
      payload: { cron: '0 9 * * *', prompt: 'daily triage', workerImage: 'sagewright-worker-codex:latest' },
    });
    expect(created.statusCode).toBe(201);
    expect((created.json() as { workerImage: string }).workerImage).toBe('sagewright-worker-codex:latest');

    const list = await app.inject({ method: 'GET', url: '/api/scheduled-prompts', headers });
    expect((list.json() as { workerImage: string }[])[0]!.workerImage).toBe('sagewright-worker-codex:latest');
  });

  it('defaults workerImage to null when none is chosen', async () => {
    const { app } = await makeTestApp({ scheduler: fakeScheduler() });
    const headers = await login(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/scheduled-prompts',
      headers,
      payload: { cron: '0 9 * * *', prompt: 'daily triage' },
    });
    expect((created.json() as { workerImage: string | null }).workerImage).toBeNull();
  });

  it('deletes a scheduled prompt that has already spawned sessions', async () => {
    const { app, db } = await makeTestApp({ scheduler: fakeScheduler() });
    const headers = await login(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/scheduled-prompts',
      headers,
      payload: { cron: '0 9 * * *', prompt: 'daily triage' },
    });
    const { id } = created.json() as { id: string };

    // Simulate a run: a task linked back to the scheduled prompt.
    const [task] = await db
      .insert(sessions)
      .values({ kind: 'scheduled', prompt: 'daily triage', createdBy: 'al', scheduledPromptId: id })
      .returning();

    const del = await app.inject({ method: 'DELETE', url: `/api/scheduled-prompts/${id}`, headers });
    expect(del.statusCode).toBe(204);

    // The historical task survives, disassociated from the deleted prompt.
    const [after] = await db.select().from(sessions).where(eq(sessions.id, task!.id));
    expect(after!.scheduledPromptId).toBeNull();
  });

  it('rejects an unknown workerImage on create', async () => {
    const { app } = await makeTestApp({ scheduler: fakeScheduler() });
    const headers = await login(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduled-prompts',
      headers,
      // Default fake registry only knows image 'w'.
      payload: { cron: '0 9 * * *', prompt: 'x', workerImage: 'gone:latest' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an unknown workerImage on update', async () => {
    const { app } = await makeTestApp({ scheduler: fakeScheduler() });
    const headers = await login(app);
    const created = await app.inject({
      method: 'POST',
      url: '/api/scheduled-prompts',
      headers,
      payload: { cron: '0 9 * * *', prompt: 'x' },
    });
    const { id } = created.json() as { id: string };

    const res = await app.inject({
      method: 'PUT',
      url: `/api/scheduled-prompts/${id}`,
      headers,
      payload: { workerImage: 'gone:latest' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('re-enabling a prompt resets lastRunAt so it waits for its next real tick', async () => {
    const { app, db } = await makeTestApp({ scheduler: fakeScheduler() });
    const headers = await login(app);
    // Disabled for a week — its stale lastRunAt would otherwise look like a missed
    // tick and fire the prompt the moment it is re-enabled.
    const stale = new Date('2000-01-01T00:00:00Z');
    const [row] = await db
      .insert(scheduledPrompts)
      .values({ cron: '0 3 * * *', prompt: 'nightly', createdBy: 'al', enabled: false, lastRunAt: stale })
      .returning();

    const res = await app.inject({
      method: 'PUT',
      url: `/api/scheduled-prompts/${row!.id}`,
      headers,
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(200);

    const [after] = await db.select().from(scheduledPrompts).where(eq(scheduledPrompts.id, row!.id));
    expect(after!.enabled).toBe(true);
    expect(after!.lastRunAt!.getTime()).toBeGreaterThan(stale.getTime());
  });

  it('rejects an invalid cron expression', async () => {
    const { app } = await makeTestApp({ scheduler: fakeScheduler({ isValidCron: () => false }) });
    const headers = await login(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduled-prompts',
      headers,
      payload: { cron: 'nonsense', prompt: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });
});
