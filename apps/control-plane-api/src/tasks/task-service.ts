import { EventType, SessionStatus, type CreateSessionInput, type Session, type SessionKind, type SessionMode, type UpdateSessionInput } from '@sagewright/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';

import type { Db } from '../db/client';
import { events, inboundMessages, sessions } from '../db/schema';
import type { EventStore } from '../events/event-store';
import type { EventBus } from '../events/event-bus';
import type { SessionRuntime } from '../sessions/session-runtime';
import type { SessionService } from '../sessions/session-service';
import type { AgentRunner } from './agent-runner';
import type { SpawnInput } from './worker-spawner';
import type { Volume } from '../git/volume';

interface TaskServiceDeps {
  db: Db;
  eventStore: EventStore;
  eventBus: EventBus;
  spawner: { spawn: (i: SpawnInput) => Promise<{ containerId: string }>; retire: (id: string) => Promise<void> };
  agentRunner: AgentRunner;
  volume: Volume;
  sessionService: SessionService;
  sessionRuntime: SessionRuntime;
}

interface CreateOpts {
  mode?: SessionMode;
  scheduledPromptId?: string;
}

export const rowToSession = (r: typeof sessions.$inferSelect): Session => ({
  id: r.id,
  kind: r.kind as Session['kind'],
  name: r.name,
  prompt: r.prompt,
  workerImage: r.workerImage,
  status: r.status as SessionStatus,
  branch: r.branch,
  prUrl: r.prUrl,
  createdBy: r.createdBy,
  containerId: r.containerId,
  scheduledPromptId: r.scheduledPromptId,
  parentSessionId: r.parentSessionId,
  workflowId: r.workflowId,
  workflowStepKey: r.workflowStepKey,
  currentStepKey: r.currentStepKey,
  iteration: r.iteration,
  error: r.error,
  archivedAt: r.archivedAt ? r.archivedAt.toISOString() : null,
  startedAt: r.startedAt ? r.startedAt.toISOString() : null,
  endedAt: r.endedAt ? r.endedAt.toISOString() : null,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

export const createTaskService = (deps: TaskServiceDeps) => {
  const emit = async (taskId: string, events: { type: EventType; payload: Record<string, unknown> }[]) => {
    const appended = await deps.eventStore.append(taskId, events);
    for (const e of appended) deps.eventBus.publish(taskId, e);
  };

  const create = async (input: CreateSessionInput, createdBy: string, opts: CreateOpts = {}): Promise<Session> => {
    const mode: SessionMode = opts.mode ?? 'interactive';
    // A scheduled fire is a headless run with a distinct kind; everything else maps 1:1.
    const kind: SessionKind = opts.scheduledPromptId
      ? 'scheduled'
      : mode === 'interactive'
        ? 'interactive'
        : 'headless';

    // Provisioning (insert, image validation, env, worktrees, spawn, FAILED-on-throw)
    // is owned by the single session seam; here we only attach the drive policy.
    const { id, containerId, sessionDir: dir, manifest, githubCredential } = await deps.sessionService.spawnSession({
      kind,
      createdBy,
      prompt: input.prompt ?? null,
      workerImage: input.workerImage,
      scheduledPromptId: opts.scheduledPromptId,
    });
    const [row] = await deps.db.select().from(sessions).where(eq(sessions.id, id)).limit(1);

    if (mode === 'headless') {
      // The box is up; drive the agent over `docker exec` and stream it as the transcript.
      // Fire-and-forget: the run owns its own status/PR events; surface a crash as FAILED.
      void deps.agentRunner
        .run({ taskId: id, containerId, manifest, sessionDir: dir, githubIdentity: githubCredential })
        .catch(async (err) => {
          await emit(id, [
            { type: EventType.ERROR, payload: { message: String(err) } },
            { type: EventType.STATUS, payload: { status: SessionStatus.FAILED } },
          ]);
          await deps.db.update(sessions).set({ status: SessionStatus.FAILED }).where(eq(sessions.id, id));
        });
      return { ...rowToSession(row!), status: SessionStatus.RUNNING };
    }

    // Interactive: bring up the persistent agent runtime. Its first turn streams to the
    // durable event log AND to any attached socket, and the agent's life is decoupled from
    // the browser — closing the tab leaves it DETACHED and resumable, not destroyed.
    deps.sessionRuntime.start({ sessionId: id, containerId, manifest, sessionDir: dir, githubIdentity: githubCredential });
    return { ...rowToSession(row!), status: SessionStatus.RUNNING };
  };

  return {
    create,
    // Standalone sessions only — workflow step rows are owned by their run and shown
    // on the workflow run graph, not in the flat sessions list / canvas.
    list: async (createdBy?: string): Promise<Session[]> => {
      // Standalone sessions only: exclude workflow_step children (have a parent) and
      // the workflow parent itself (has a workflow_id) — both belong to the run graph.
      const standalone = and(isNull(sessions.parentSessionId), isNull(sessions.workflowId));
      const where = createdBy ? and(eq(sessions.createdBy, createdBy), standalone) : standalone;
      const rows = await deps.db.select().from(sessions).where(where).orderBy(desc(sessions.createdAt));
      return rows.map(rowToSession);
    },
    get: async (id: string): Promise<Session | null> => {
      const [row] = await deps.db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
      return row ? rowToSession(row) : null;
    },
    // Rename a session. A blank name clears the custom label back to the default.
    update: async (id: string, input: UpdateSessionInput): Promise<Session | null> => {
      const name = input.name?.trim() || null;
      const [row] = await deps.db.update(sessions).set({ name }).where(eq(sessions.id, id)).returning();
      return row ? rowToSession(row) : null;
    },
    stop: async (id: string): Promise<void> => {
      const [row] = await deps.db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
      if (!row) return;
      if (row.containerId) await deps.spawner.retire(row.containerId);
      await deps.volume.removeSessionWorktrees(id).catch(() => undefined);
      await deps.db.update(sessions).set({ status: SessionStatus.STOPPED }).where(eq(sessions.id, id));
      // Surface the stop in the transcript so a live viewer sees it.
      await emit(id, [{ type: EventType.STATUS, payload: { status: SessionStatus.STOPPED } }]);
    },
    // Hide a finished session from the active list. Reversible — the row stays.
    archive: async (id: string): Promise<void> => {
      await deps.db.update(sessions).set({ archivedAt: new Date() }).where(eq(sessions.id, id));
    },
    // Permanently drop an archived session and its dependent rows.
    remove: async (id: string): Promise<void> => {
      const [row] = await deps.db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
      if (!row) return;
      if (row.containerId) await deps.spawner.retire(row.containerId).catch(() => undefined);
      await deps.volume.removeSessionWorktrees(id).catch(() => undefined);
      await deps.db.delete(inboundMessages).where(eq(inboundMessages.sessionId, id));
      await deps.db.delete(events).where(eq(events.sessionId, id));
      await deps.db.delete(sessions).where(eq(sessions.id, id));
    },
  };
};

export type TaskService = ReturnType<typeof createTaskService>;
