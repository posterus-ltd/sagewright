import { randomUUID } from 'node:crypto';

import { SessionStatus } from '@sagewright/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { sessions } from '../db/schema';
import { createEventBus } from '../events/event-bus';
import { createEventStore } from '../events/event-store';
import { makeTestApp } from '../test/make-test-app';
import { createReconciler } from './reconciler';

type TestDb = Awaited<ReturnType<typeof makeTestApp>>['db'];

const insert = async (db: TestDb, values: Record<string, unknown>): Promise<string> => {
  const [row] = await db
    .insert(sessions)
    .values({ createdBy: randomUUID(), ...values } as typeof sessions.$inferInsert)
    .returning();
  return row!.id;
};

const statusOf = async (db: TestDb, id: string): Promise<string> => {
  const [row] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  return row!.status;
};

const setup = async (over: { alive?: boolean } = {}) => {
  const { db } = await makeTestApp();
  const retire = vi.fn(async () => undefined);
  const removeSessionWorktrees = vi.fn(async () => undefined);
  const resumeWorkflow = vi.fn(async () => undefined);
  // Mutable so tests can register labeled containers after inserting their rows.
  const labeled: { containerId: string; sessionId: string }[] = [];
  const reconciler = createReconciler({
    db: db as never,
    eventStore: createEventStore(db as never),
    eventBus: createEventBus(),
    containerAlive: async () => over.alive ?? false,
    listLabeledContainers: async () => labeled,
    retire,
    removeSessionWorktrees,
    resumeWorkflow,
    logger: { error: () => undefined },
  });
  return { db, reconciler, retire, removeSessionWorktrees, resumeWorkflow, labeled };
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

  it('fails a workflow_step and retires its box but does NOT remove the run-shared worktree', async () => {
    const { db, reconciler, retire, removeSessionWorktrees } = await setup({ alive: true });
    const parent = await insert(db, { kind: 'workflow', status: SessionStatus.RUNNING });
    const step = await insert(db, { kind: 'workflow_step', status: SessionStatus.RUNNING, containerId: 'c1', parentSessionId: parent });

    await reconciler.reconcile();

    expect(await statusOf(db, step)).toBe(SessionStatus.FAILED);
    expect(retire).toHaveBeenCalledWith('c1');
    // A step shares the RUN's worktree (keyed by the run id); the reconciler must not
    // sweep it — the parent's resume re-drives against it and owns its cleanup.
    expect(removeSessionWorktrees).not.toHaveBeenCalledWith(step);
  });

  it('sweeps a labeled container that has no session row (a workflow ops box)', async () => {
    const { reconciler, retire, labeled } = await setup();
    labeled.push({ containerId: 'c-ops', sessionId: 'r1-ops' });

    await reconciler.reconcile();

    expect(retire).toHaveBeenCalledWith('c-ops');
  });

  it('sweeps a labeled container whose session settled terminal without adopting it', async () => {
    // stop-during-provisioning: the row went STOPPED before the spawn finished, so
    // containerId was never persisted — only the label ties the box to the session.
    const { db, reconciler, retire, labeled } = await setup();
    const id = await insert(db, { kind: 'interactive', status: SessionStatus.STOPPED, containerId: null });
    labeled.push({ containerId: 'c-leak', sessionId: id });

    await reconciler.reconcile();

    expect(retire).toHaveBeenCalledWith('c-leak');
  });

  it('leaves a labeled container whose session is still live (a detached box)', async () => {
    const { db, reconciler, retire, labeled } = await setup({ alive: true });
    const id = await insert(db, { kind: 'interactive', status: SessionStatus.RUNNING, containerId: 'c1' });
    labeled.push({ containerId: 'c1', sessionId: id });

    await reconciler.reconcile();

    // The row reconciles to DETACHED (non-terminal) — its box must survive the sweep.
    expect(retire).not.toHaveBeenCalled();
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
