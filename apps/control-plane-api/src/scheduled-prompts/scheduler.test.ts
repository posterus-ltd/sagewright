import { SessionStatus } from '@sagewright/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { scheduledPrompts, sessions } from '../db/schema';
import { makeTestApp } from '../test/make-test-app';
import { createWorkflowService } from '../workflows/workflow-service';
import { createScheduler } from './scheduler';

const insertPrompt = async (
  db: Awaited<ReturnType<typeof makeTestApp>>['db'],
  over: Partial<typeof scheduledPrompts.$inferInsert> = {},
) => {
  const [row] = await db
    .insert(scheduledPrompts)
    .values({ cron: '* * * * * *', prompt: 'do it', createdBy: 'alice', ...over })
    .returning();
  return row!;
};

const rowFor = (r: typeof scheduledPrompts.$inferSelect) => ({
  id: r.id,
  cron: r.cron,
  prompt: r.prompt,
  enabled: r.enabled,
  createdBy: r.createdBy,
  workerImage: r.workerImage,
});

describe('createScheduler', () => {
  it('validates cron expressions', () => {
    const scheduler = createScheduler({ db: {} as never, taskService: {} as never });
    expect(scheduler.isValidCron('0 9 * * *')).toBe(true);
    expect(scheduler.isValidCron('not a cron')).toBe(false);
  });

  it('fires a headless task and stamps lastRunAt', async () => {
    const { db } = await makeTestApp();
    const row = await insertPrompt(db);
    const create = vi.fn(async () => ({}) as never);

    const scheduler = createScheduler({ db: db as never, taskService: { create } as never });
    scheduler.register(rowFor(row));
    await vi.waitFor(() => expect(create).toHaveBeenCalled(), { timeout: 2000 });
    scheduler.stopAll();

    // Runs as the prompt's creator — not a synthetic 'scheduler' user — so the
    // task gets that user's repos, default worker, and env.
    expect(create).toHaveBeenCalledWith({ prompt: 'do it' }, 'alice', { mode: 'headless', scheduledPromptId: row.id });
    await vi.waitFor(async () => {
      const [after] = await db.select().from(scheduledPrompts).where(eq(scheduledPrompts.id, row.id));
      expect(after!.lastRunAt).not.toBeNull();
    });
  });

  it('forwards the prompt-pinned workerImage to the task', async () => {
    const { db } = await makeTestApp();
    const row = await insertPrompt(db, { workerImage: 'sagewright-worker-codex:latest' });
    const create = vi.fn(async () => ({}) as never);

    const scheduler = createScheduler({ db: db as never, taskService: { create } as never });
    scheduler.register(rowFor(row));
    await vi.waitFor(() => expect(create).toHaveBeenCalled(), { timeout: 2000 });
    scheduler.stopAll();

    expect(create).toHaveBeenCalledWith(
      { prompt: 'do it', workerImage: 'sagewright-worker-codex:latest' },
      'alice',
      { mode: 'headless', scheduledPromptId: row.id },
    );
  });

  it('logs the error and still stamps lastRunAt when a run fails to start', async () => {
    const { db } = await makeTestApp();
    const row = await insertPrompt(db, { workerImage: 'gone:latest' });
    const create = vi.fn(async () => {
      throw new Error('unknown worker image: gone:latest');
    });
    const logger = { error: vi.fn() };

    const scheduler = createScheduler({ db: db as never, taskService: { create } as never, logger });
    scheduler.register(rowFor(row));
    // A failed run must not crash the cron callback; the lastRunAt stamp proves
    // fire() ran to completion despite create() rejecting.
    await vi.waitFor(
      async () => {
        const [after] = await db.select().from(scheduledPrompts).where(eq(scheduledPrompts.id, row.id));
        expect(after!.lastRunAt).not.toBeNull();
      },
      { timeout: 2000 },
    );
    scheduler.stopAll();

    expect(create).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it('skips a tick while a previous run of the same prompt is still active', async () => {
    const { db } = await makeTestApp();
    const row = await insertPrompt(db);
    // A still-working session from an earlier fire — provisioning is long over, so
    // the in-memory inFlight set can't know about it; only the DB does.
    await db
      .insert(sessions)
      .values({ kind: 'scheduled', status: SessionStatus.RUNNING, createdBy: 'alice', scheduledPromptId: row.id });
    const create = vi.fn(async () => ({}) as never);

    const scheduler = createScheduler({ db: db as never, taskService: { create } as never });
    scheduler.register(rowFor(row));
    await new Promise((r) => setTimeout(r, 2200)); // ≥2 ticks of '* * * * * *'
    scheduler.stopAll();

    expect(create).not.toHaveBeenCalled();
    // A skipped tick is not an attempt — it must not shift the catch-up basis.
    const [after] = await db.select().from(scheduledPrompts).where(eq(scheduledPrompts.id, row.id));
    expect(after!.lastRunAt).toBeNull();
  }, 10000);

  it('fires again once the previous run has settled', async () => {
    const { db } = await makeTestApp();
    const row = await insertPrompt(db);
    await db
      .insert(sessions)
      .values({ kind: 'scheduled', status: SessionStatus.DONE, createdBy: 'alice', scheduledPromptId: row.id });
    const create = vi.fn(async () => ({}) as never);

    const scheduler = createScheduler({ db: db as never, taskService: { create } as never });
    scheduler.register(rowFor(row));
    await vi.waitFor(() => expect(create).toHaveBeenCalled(), { timeout: 2000 });
    scheduler.stopAll();
  });

  it('does not register a disabled prompt', () => {
    const create = vi.fn();
    const scheduler = createScheduler({ db: {} as never, taskService: { create } as never });
    scheduler.register({ id: 'sp2', cron: '* * * * * *', prompt: 'x', enabled: false, createdBy: 'alice', workerImage: null });
    scheduler.stopAll();
    expect(create).not.toHaveBeenCalled();
  });

  it('runs no crons and does not even query when this instance is not the leader', async () => {
    const create = vi.fn(async () => ({}) as never);
    const select = vi.fn();
    const db = { select } as never;
    const scheduler = createScheduler({
      db,
      taskService: { create } as never,
      leadership: { acquire: async () => false },
    });

    await scheduler.start();
    scheduler.stopAll();

    expect(select).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('fires a catch-up run on start for a prompt whose scheduled time passed while down', async () => {
    const { db } = await makeTestApp();
    // Daily 09:00; lastRunAt years ago → the most recent 09:00 is unrun → catch-up now.
    const row = await insertPrompt(db, { cron: '0 9 * * *', prompt: 'daily', createdBy: 'al', lastRunAt: new Date('2000-01-01T00:00:00Z') });
    const create = vi.fn(async () => ({}) as never);

    const scheduler = createScheduler({ db: db as never, taskService: { create } as never });
    await scheduler.start();
    await vi.waitFor(() => expect(create).toHaveBeenCalled(), { timeout: 2000 });
    scheduler.stopAll();

    expect(create).toHaveBeenCalledWith({ prompt: 'daily' }, 'al', { mode: 'headless', scheduledPromptId: row.id });
  });

  it('does NOT catch-up-fire a never-run prompt on start (waits for its first real tick)', async () => {
    const { db } = await makeTestApp();
    // Never run (lastRunAt: null) and not due for hours — adding it must not fire it now,
    // even though measuring a "missed" tick from epoch would make it look overdue.
    await insertPrompt(db, { cron: '0 9 * * *', prompt: 'daily', createdBy: 'al' });
    const create = vi.fn(async () => ({}) as never);

    const scheduler = createScheduler({ db: db as never, taskService: { create } as never });
    await scheduler.start();
    await new Promise((r) => setTimeout(r, 50)); // give any erroneous catch-up a chance to fire
    scheduler.stopAll();

    expect(create).not.toHaveBeenCalled();
  });

  it('does NOT catch-up-fire on sync() — a CRUD write is not a boot', async () => {
    const { db } = await makeTestApp();
    // Overdue by the boot rules; but this instance never went down — a re-enabled or
    // edited prompt syncing at noon must not fire the missed 09:00 immediately.
    await insertPrompt(db, { cron: '0 9 * * *', prompt: 'daily', createdBy: 'al', lastRunAt: new Date('2000-01-01T00:00:00Z') });
    const create = vi.fn(async () => ({}) as never);

    const scheduler = createScheduler({ db: db as never, taskService: { create } as never });
    await scheduler.sync();
    await new Promise((r) => setTimeout(r, 50));
    scheduler.stopAll();

    expect(create).not.toHaveBeenCalled();
  });

  it('skips a workflow cron tick while a previous run of that workflow is active', async () => {
    const { db } = await makeTestApp();
    const workflowService = createWorkflowService({ db: db as never });
    const wf = await workflowService.create(
      {
        definition: {
          name: 'W',
          trigger: { type: 'cron' as const, cron: '* * * * * *' },
          maxIterations: 1,
          steps: [
            { key: 'work', name: 'Work', kind: 'work' as const, workerImage: 'w', goal: 'g' },
            { key: 'check', name: 'Check', kind: 'validation' as const, workerImage: 'w', goal: 'v' },
          ],
        },
        enabled: true,
      },
      'al',
    );
    await db.insert(sessions).values({ kind: 'workflow', status: SessionStatus.RUNNING, createdBy: 'al', workflowId: wf.id });
    const start = vi.fn(async () => null);

    const scheduler = createScheduler({
      db: db as never,
      taskService: { create: vi.fn() } as never,
      workflowService,
      workflowRunner: { start } as never,
    });
    await scheduler.start();
    await new Promise((r) => setTimeout(r, 2200)); // ≥2 ticks
    scheduler.stopAll();

    expect(start).not.toHaveBeenCalled();
  }, 10000);

  it('fires a workflow cron when no run of it is active', async () => {
    const { db } = await makeTestApp();
    const workflowService = createWorkflowService({ db: db as never });
    const wf = await workflowService.create(
      {
        definition: {
          name: 'W',
          trigger: { type: 'cron' as const, cron: '* * * * * *' },
          maxIterations: 1,
          steps: [
            { key: 'work', name: 'Work', kind: 'work' as const, workerImage: 'w', goal: 'g' },
            { key: 'check', name: 'Check', kind: 'validation' as const, workerImage: 'w', goal: 'v' },
          ],
        },
        enabled: true,
      },
      'al',
    );
    const start = vi.fn(async () => null);

    const scheduler = createScheduler({
      db: db as never,
      taskService: { create: vi.fn() } as never,
      workflowService,
      workflowRunner: { start } as never,
    });
    await scheduler.start();
    await vi.waitFor(() => expect(start).toHaveBeenCalledWith(wf.id, 'al'), { timeout: 2000 });
    scheduler.stopAll();
  });
});
