import { SessionStatus } from '@sagewright/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { sessions } from '../db/schema';
import { createEventBus } from '../events/event-bus';
import { createEventStore } from '../events/event-store';
import { makeTestApp } from '../test/make-test-app';
import { createReconciler } from './reconciler';

const insert = async (db: unknown, values: Record<string, unknown>): Promise<string> => {
  const [row] = await (db as never as { insert: (t: unknown) => never })
    .insert(sessions)
    .values({ createdBy: 'al', ...values })
    .returning();
  return (row as { id: string }).id;
};

const statusOf = async (db: unknown, id: string): Promise<string> => {
  const [row] = await (db as never as { select: () => never }).select().from(sessions).where(eq(sessions.id, id)).limit(1);
  return (row as { status: string }).status;
};

const setup = async (over: { alive?: boolean } = {}) => {
  const { db } = await makeTestApp();
  const retire = vi.fn(async () => undefined);
  const removeSessionWorktrees = vi.fn(async () => undefined);
  const resumeWorkflow = vi.fn(async () => undefined);
  const reconciler = createReconciler({
    db: db as never,
    eventStore: createEventStore(db as never),
    eventBus: createEventBus(),
    containerAlive: async () => over.alive ?? false,
    retire,
    removeSessionWorktrees,
    resumeWorkflow,
    logger: { error: () => undefined },
  });
  return { db, reconciler, retire, removeSessionWorktrees, resumeWorkflow };
};

describe('reconciler', () => {
  it('marks an interactive session DETACHED when its container is still alive', async () => {
    const { db, reconciler } = await setup({ alive: true });
    const id = await insert(db, { kind: 'interactive', status: SessionStatus.RUNNING, containerId: 'c1' });

    await reconciler.reconcile();

    expect(await statusOf(db, id)).toBe(SessionStatus.DETACHED);
  });

  it('fails an interactive session and sweeps worktrees when its container is gone', async () => {
    const { db, reconciler, removeSessionWorktrees } = await setup({ alive: false });
    const id = await insert(db, { kind: 'interactive', status: SessionStatus.RUNNING, containerId: 'c1' });

    await reconciler.reconcile();

    expect(await statusOf(db, id)).toBe(SessionStatus.FAILED);
    expect(removeSessionWorktrees).toHaveBeenCalledWith(id);
  });

  it('fails a headless run interrupted by a restart and retires a still-alive box', async () => {
    const { db, reconciler, retire } = await setup({ alive: true });
    const id = await insert(db, { kind: 'headless', status: SessionStatus.RUNNING, containerId: 'c1' });

    await reconciler.reconcile();

    expect(await statusOf(db, id)).toBe(SessionStatus.FAILED);
    expect(retire).toHaveBeenCalledWith('c1');
  });

  it('resumes a non-terminal workflow parent instead of failing it', async () => {
    const { db, reconciler, resumeWorkflow } = await setup();
    const id = await insert(db, { kind: 'workflow', status: SessionStatus.RUNNING, currentStepKey: 'implement' });

    await reconciler.reconcile();

    expect(resumeWorkflow).toHaveBeenCalledWith(id);
    // The reconciler hands off to resume; it must not stamp the parent FAILED itself.
    expect(await statusOf(db, id)).toBe(SessionStatus.RUNNING);
  });

  it('leaves terminal sessions untouched', async () => {
    const { db, reconciler, retire, resumeWorkflow } = await setup({ alive: true });
    const id = await insert(db, { kind: 'headless', status: SessionStatus.DONE, containerId: 'c1' });

    await reconciler.reconcile();

    expect(await statusOf(db, id)).toBe(SessionStatus.DONE);
    expect(retire).not.toHaveBeenCalled();
    expect(resumeWorkflow).not.toHaveBeenCalled();
  });
});
