import { EventType, SessionKind, SessionStatus, isTerminalStatus } from '@sagewright/shared';
import { eq } from 'drizzle-orm';

import type { Db } from '../db/client';
import { sessions } from '../db/schema';
import type { EventStore } from '../events/event-store';
import type { EventBus } from '../events/event-bus';

interface ReconcilerDeps {
  db: Db;
  eventStore: EventStore;
  eventBus: EventBus;
  /** Whether a container still exists/runs. Injected so tests need no docker. */
  containerAlive: (containerId: string) => Promise<boolean>;
  /** Every container carrying the sagewright session label, live or exited. */
  listLabeledContainers: () => Promise<{ containerId: string; sessionId: string }[]>;
  retire: (containerId: string) => Promise<void>;
  removeSessionWorktrees: (id: string) => Promise<void>;
  /** Re-drive a workflow run from its persisted step (workflowDriver.resume). */
  resumeWorkflow: (parentId: string) => Promise<void>;
  logger?: { error: (err: unknown, msg?: string) => void };
}

/**
 * Boot-time reconciliation: the DB outlives the process, but the in-process agent
 * runtime and workflow drive loops do not. On startup we walk every non-terminal
 * session and bring the DB back in line with container reality:
 *   - a workflow parent → re-drive from its current step;
 *   - an interactive session whose box is still up → DETACHED (resumable);
 *   - a driven run (headless/scheduled/step) whose driver died → FAILED (+retire);
 *   - any session whose container is gone → FAILED (+sweep its worktrees).
 */
export const createReconciler = (deps: ReconcilerDeps) => {
  const logger = deps.logger ?? console;

  const emit = async (sessionId: string, type: EventType, payload: Record<string, unknown>): Promise<void> => {
    const stored = await deps.eventStore.append(sessionId, [{ type, payload }]);
    for (const e of stored) deps.eventBus.publish(sessionId, e);
  };

  const fail = async (id: string, message: string): Promise<void> => {
    await emit(id, EventType.ERROR, { message });
    await emit(id, EventType.STATUS, { status: SessionStatus.FAILED });
    await deps.db.update(sessions).set({ status: SessionStatus.FAILED, endedAt: new Date(), updatedAt: new Date() }).where(eq(sessions.id, id));
  };

  const reconcileRow = async (row: typeof sessions.$inferSelect): Promise<void> => {
    // The workflow parent has no container of its own; its drive loop is what died.
    if (row.kind === SessionKind.WORKFLOW) {
      await deps.resumeWorkflow(row.id);
      return;
    }

    const alive = row.containerId ? await deps.containerAlive(row.containerId) : false;

    if (row.kind === SessionKind.INTERACTIVE) {
      if (alive) {
        // Box is up but the live exec is gone with the process — rest as DETACHED so
        // the next input can resume it.
        await emit(row.id, EventType.STATUS, { status: SessionStatus.DETACHED });
        await deps.db.update(sessions).set({ status: SessionStatus.DETACHED, updatedAt: new Date() }).where(eq(sessions.id, row.id));
      } else {
        await fail(row.id, 'reconciler: container missing on restart');
        await deps.removeSessionWorktrees(row.id).catch(() => undefined);
      }
      return;
    }

    // A workflow_step's box is orphaned by the restart: settle the row FAILED and retire
    // its container, but DON'T touch worktrees. A step shares the RUN's single worktree
    // (keyed by the run id, not the step id) — the parent's resumeWorkflow re-drives the
    // current step against it and owns its cleanup. Removing it here (or keying removal by
    // the step id) would either no-op wrongly or yank the worktree out from under the resume.
    if (row.kind === SessionKind.WORKFLOW_STEP) {
      await fail(row.id, 'reconciler: workflow step interrupted by a control-plane restart');
      if (alive && row.containerId) await deps.retire(row.containerId).catch(() => undefined);
      return;
    }

    // headless / scheduled: a control-plane-driven run whose driver died on restart.
    // There's no way to re-attach the exit, so settle it FAILED.
    await fail(row.id, 'reconciler: run interrupted by a control-plane restart');
    if (alive && row.containerId) await deps.retire(row.containerId).catch(() => undefined);
    else await deps.removeSessionWorktrees(row.id).catch(() => undefined);
  };

  // Orphan sweep: retire any labeled container with no LIVE session row behind it.
  // The row walk above only reaches containers whose id made it into a row — this
  // catches the rest: a workflow run's ops box (no row at all) and a box whose
  // session settled terminal before adopting it (stop-during-provisioning).
  const sweepOrphans = async (): Promise<void> => {
    const labeled = await deps.listLabeledContainers().catch(() => [] as { containerId: string; sessionId: string }[]);
    if (!labeled.length) return;
    // Re-read: reconcileRow above may have just settled rows terminal.
    const rows = await deps.db.select().from(sessions);
    const live = new Set(rows.filter((r) => !isTerminalStatus(r.status as SessionStatus)).map((r) => r.id));
    for (const c of labeled) {
      if (live.has(c.sessionId)) continue;
      await deps.retire(c.containerId).catch(() => undefined);
    }
  };

  return {
    reconcile: async (): Promise<void> => {
      const rows = await deps.db.select().from(sessions);
      for (const row of rows) {
        if (isTerminalStatus(row.status as SessionStatus)) continue;
        try {
          await reconcileRow(row);
        } catch (err) {
          logger.error(err, `reconcile failed for session ${row.id}`);
        }
      }
      await sweepOrphans();
    },
  };
};

export type Reconciler = ReturnType<typeof createReconciler>;
