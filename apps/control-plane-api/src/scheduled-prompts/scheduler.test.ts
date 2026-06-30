import { describe, expect, it, vi } from 'vitest';

import { createScheduler } from './scheduler';

describe('createScheduler', () => {
  it('validates cron expressions', () => {
    const scheduler = createScheduler({ db: {} as never, taskService: {} as never });
    expect(scheduler.isValidCron('0 9 * * *')).toBe(true);
    expect(scheduler.isValidCron('not a cron')).toBe(false);
  });

  it('fires a headless task and stamps lastRunAt', async () => {
    const create = vi.fn(async () => ({}) as never);
    const set = vi.fn(() => ({ where: vi.fn(async () => undefined) }));
    const db = { update: vi.fn(() => ({ set })) } as never;

    const scheduler = createScheduler({ db, taskService: { create } as never });
    // Register a job that runs every second, then wait for one fire.
    scheduler.register({ id: 'sp1', cron: '* * * * * *', prompt: 'do it', enabled: true, createdBy: 'alice', workerImage: null });
    await vi.waitFor(() => expect(create).toHaveBeenCalled(), { timeout: 2000 });
    scheduler.stopAll();

    // Runs as the prompt's creator — not a synthetic 'scheduler' user — so the
    // task gets that user's repos, default worker, and env.
    expect(create).toHaveBeenCalledWith(
      { prompt: 'do it' },
      'alice',
      { mode: 'headless', scheduledPromptId: 'sp1' },
    );
  });

  it('forwards the prompt-pinned workerImage to the task', async () => {
    const create = vi.fn(async () => ({}) as never);
    const set = vi.fn(() => ({ where: vi.fn(async () => undefined) }));
    const db = { update: vi.fn(() => ({ set })) } as never;

    const scheduler = createScheduler({ db, taskService: { create } as never });
    scheduler.register({ id: 'sp3', cron: '* * * * * *', prompt: 'do it', enabled: true, createdBy: 'alice', workerImage: 'sagewright-worker-codex:latest' });
    await vi.waitFor(() => expect(create).toHaveBeenCalled(), { timeout: 2000 });
    scheduler.stopAll();

    expect(create).toHaveBeenCalledWith(
      { prompt: 'do it', workerImage: 'sagewright-worker-codex:latest' },
      'alice',
      { mode: 'headless', scheduledPromptId: 'sp3' },
    );
  });

  it('logs the error and still stamps lastRunAt when a run fails to start', async () => {
    const create = vi.fn(async () => {
      throw new Error('unknown worker image: gone:latest');
    });
    const where = vi.fn(async () => undefined);
    const set = vi.fn(() => ({ where }));
    const db = { update: vi.fn(() => ({ set })) } as never;
    const logger = { error: vi.fn() };

    const scheduler = createScheduler({ db, taskService: { create } as never, logger });
    scheduler.register({ id: 'sp4', cron: '* * * * * *', prompt: 'do it', enabled: true, createdBy: 'alice', workerImage: 'gone:latest' });
    // A failed run must not crash the cron callback; the lastRunAt write proves
    // fire() ran to completion despite create() rejecting.
    await vi.waitFor(() => expect(where).toHaveBeenCalled(), { timeout: 2000 });
    scheduler.stopAll();

    expect(create).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith({ lastRunAt: expect.any(Date) });
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
    const create = vi.fn(async () => ({}) as never);
    const where = vi.fn(async () => undefined);
    const set = vi.fn(() => ({ where }));
    // Daily 09:00; lastRunAt years ago → the most recent 09:00 is unrun → catch-up now.
    const rows = [
      { id: 'sp', cron: '0 9 * * *', prompt: 'daily', enabled: true, createdBy: 'al', workerImage: null, lastRunAt: new Date('2000-01-01T00:00:00Z') },
    ];
    const db = { select: () => ({ from: async () => rows }), update: () => ({ set }) } as never;

    const scheduler = createScheduler({ db, taskService: { create } as never });
    await scheduler.start();
    await vi.waitFor(() => expect(create).toHaveBeenCalled(), { timeout: 2000 });
    scheduler.stopAll();

    expect(create).toHaveBeenCalledWith({ prompt: 'daily' }, 'al', { mode: 'headless', scheduledPromptId: 'sp' });
  });
});
