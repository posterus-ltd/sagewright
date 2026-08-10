import { EventType, SHELL_TMUX_SESSION, SessionKind, SessionMode, SessionOrigin, SessionStatus, isTerminalStatus, modeForKind, sessionDir, type CreateSessionInput, type Session, type UpdateSessionInput } from '@sagewright/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';

import type { Db } from '../db/client';
import { events, inboundMessages, sessions, users } from '../db/schema';
import type { EventStore } from '../events/event-store';
import type { EventBus } from '../events/event-bus';
import type { SessionRuntime } from '../sessions/session-runtime';
import type { SessionService } from '../sessions/session-service';
import type { AgentDriver } from './agent-driver';
import type { ContainerExec } from './docker-client';
import type { SpawnInput } from './runner-spawner';
import type { Volume } from '../git/volume';

interface TaskServiceDeps {
  db: Db;
  eventStore: EventStore;
  eventBus: EventBus;
  spawner: { spawn: (i: SpawnInput) => Promise<{ containerId: string }>; retire: (id: string) => Promise<void> };
  agentDriver: AgentDriver;
  // Runs the shell widget's command in a persistent tmux once its box is up (no agent).
  containerExec: Pick<ContainerExec, 'capture'>;
  volume: Volume;
  sessionService: SessionService;
  sessionRuntime: SessionRuntime;
}

interface CreateOpts {
  scheduledPromptId?: string;
  // Set when an agent spawns a child session over MCP: the calling session's id. Makes
  // the new session a headless child of it (grouped under it in the run graph).
  parentSessionId?: string;
  // Present → a no-agent SHELL session: this CLI runs in a persistent terminal, no agent.
  command?: string;
  // Who initiated it: 'user' (a human) or 'agent' (spawned over MCP / delegated).
  origin?: SessionOrigin;
}

// `createdBy` is the creator's opaque user id; `createdByName` carries the resolved
// username for display and defaults to null. The display read paths (list/get/graph)
// override it via a join to `users`; callers that don't care (e.g. workflow steps) get null.
export const rowToSession = (r: typeof sessions.$inferSelect): Session => ({
  id: r.id,
  kind: r.kind as Session['kind'],
  name: r.name,
  prompt: r.prompt,
  command: r.command,
  origin: r.origin as SessionOrigin,
  runnerImage: r.runnerImage,
  status: r.status as SessionStatus,
  branch: r.branch,
  prUrl: r.prUrl,
  createdBy: r.createdBy,
  createdByName: null,
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

// A session row left-joined to its creator; `users` is null if the creator was deleted
// (references are loose, so the row survives). Resolves `createdByName` for display.
type SessionWithOwner = { sessions: typeof sessions.$inferSelect; users: { username: string } | null };
const joinedToSession = (r: SessionWithOwner): Session => ({
  ...rowToSession(r.sessions),
  createdByName: r.users?.username ?? null,
});

export const createTaskService = (deps: TaskServiceDeps) => {
  const emit = async (taskId: string, events: { type: EventType; payload: Record<string, unknown> }[]) => {
    const appended = await deps.eventStore.append(taskId, events);
    for (const e of appended) deps.eventBus.publish(taskId, e);
  };

  const create = async (input: CreateSessionInput, createdBy: string, opts: CreateOpts = {}): Promise<Session> => {
    // Origin signals steer the kind: a `command` → SHELL (no-agent CLI widget); a scheduled
    // fire sets `scheduledPromptId` → SCHEDULED; an agent spawning over MCP sets
    // `parentSessionId` → HEADLESS child; the canvas and sessions-page routes set none →
    // INTERACTIVE. The runner-facing mode derives from the kind via `modeForKind`.
    const kind: SessionKind = opts.command
      ? SessionKind.SHELL
      : opts.scheduledPromptId
        ? SessionKind.SCHEDULED
        : opts.parentSessionId
          ? SessionKind.HEADLESS
          : SessionKind.INTERACTIVE;
    const mode: SessionMode = modeForKind(kind);

    // Provisioning (insert, image validation, env, worktrees, spawn, FAILED-on-throw)
    // is owned by the single session seam; here we only attach the drive policy.
    const { id, containerId, sessionDir: dir, manifest, githubCredential } = await deps.sessionService.spawnSession({
      kind,
      createdBy,
      prompt: input.prompt ?? null,
      command: opts.command ?? null,
      origin: opts.origin,
      runnerImage: input.runnerImage,
      scheduledPromptId: opts.scheduledPromptId,
      parentSessionId: opts.parentSessionId,
    });
    const [row] = await deps.db
      .select()
      .from(sessions)
      .leftJoin(users, eq(sessions.createdBy, users.id))
      .where(eq(sessions.id, id))
      .limit(1);

    if (mode === SessionMode.SHELL) {
      // A shell widget has no agent to drive: start its command in a persistent tmux inside
      // the box (a detached `tmux new-session` returns at once), then mark it RUNNING. The
      // tmux keeps ticking until the session is stopped; the terminal route attaches to it.
      const command = opts.command!;
      try {
        await deps.containerExec.capture(containerId, {
          cmd: ['tmux', 'new-session', '-d', '-s', SHELL_TMUX_SESSION, `exec ${command}`],
          workingDir: sessionDir(id),
        });
      } catch (err) {
        // Couldn't launch the CLI — settle FAILED so the box doesn't linger as a live-but-empty widget.
        await emit(id, [
          { type: EventType.ERROR, payload: { message: `failed to start shell command: ${String(err)}` } },
          { type: EventType.STATUS, payload: { status: SessionStatus.FAILED } },
        ]);
        await deps.db.update(sessions).set({ status: SessionStatus.FAILED, endedAt: new Date() }).where(eq(sessions.id, id));
        await deps.spawner.retire(containerId).catch(() => undefined);
        return { ...joinedToSession(row!), status: SessionStatus.FAILED };
      }
      await emit(id, [{ type: EventType.STATUS, payload: { status: SessionStatus.RUNNING } }]);
      await deps.db.update(sessions).set({ status: SessionStatus.RUNNING, startedAt: new Date() }).where(eq(sessions.id, id));
      return { ...joinedToSession(row!), status: SessionStatus.RUNNING };
    }

    if (mode === SessionMode.HEADLESS) {
      // The box is up; drive the agent over `docker exec` and stream it as the transcript.
      // Fire-and-forget: the run owns its own status/PR events; surface a crash as FAILED.
      void deps.agentDriver
        .run({ taskId: id, containerId, manifest, sessionDir: dir, githubIdentity: githubCredential })
        .catch(async (err) => {
          await emit(id, [
            { type: EventType.ERROR, payload: { message: String(err) } },
            { type: EventType.STATUS, payload: { status: SessionStatus.FAILED } },
          ]);
          await deps.db.update(sessions).set({ status: SessionStatus.FAILED, endedAt: new Date() }).where(eq(sessions.id, id));
        });
      return { ...joinedToSession(row!), status: SessionStatus.RUNNING };
    }

    // Interactive: bring up the persistent agent runtime. Its first turn streams to the
    // durable event log AND to any attached socket, and the agent's life is decoupled from
    // the browser — closing the tab leaves it DETACHED and resumable, not destroyed.
    deps.sessionRuntime.start({ sessionId: id, containerId, manifest, sessionDir: dir, githubIdentity: githubCredential });
    return { ...joinedToSession(row!), status: SessionStatus.RUNNING };
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
      const rows = await deps.db
        .select()
        .from(sessions)
        .leftJoin(users, eq(sessions.createdBy, users.id))
        .where(where)
        .orderBy(desc(sessions.createdAt));
      return rows.map(joinedToSession);
    },
    // Every session, including workflow parents and their steps — for the task
    // galaxy visualization, which maps the whole run graph, not just the flat list.
    listGraph: async (): Promise<Session[]> => {
      const rows = await deps.db
        .select()
        .from(sessions)
        .leftJoin(users, eq(sessions.createdBy, users.id))
        .orderBy(desc(sessions.createdAt));
      return rows.map(joinedToSession);
    },
    get: async (id: string): Promise<Session | null> => {
      const [row] = await deps.db
        .select()
        .from(sessions)
        .leftJoin(users, eq(sessions.createdBy, users.id))
        .where(eq(sessions.id, id))
        .limit(1);
      return row ? joinedToSession(row) : null;
    },
    // Rename a session. A blank name clears the custom label back to the default.
    update: async (id: string, input: UpdateSessionInput): Promise<Session | null> => {
      const name = input.name?.trim() || null;
      const [row] = await deps.db.update(sessions).set({ name }).where(eq(sessions.id, id)).returning();
      if (!row) return null;
      const [owner] = await deps.db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, row.createdBy))
        .limit(1);
      return { ...rowToSession(row), createdByName: owner?.username ?? null };
    },
    stop: async (id: string): Promise<void> => {
      const [row] = await deps.db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
      if (!row) return;
      // Already settled — nothing to tear down, and re-stamping STOPPED would
      // overwrite the real outcome.
      if (isTerminalStatus(row.status as SessionStatus)) return;
      if (row.containerId) await deps.spawner.retire(row.containerId);
      // A workflow parent's shared run worktree belongs to its drive loop, which
      // notices the STOPPED row at the next step boundary and sweeps it itself —
      // yanking it here would pull the tree out from under the executing step.
      if (row.kind !== SessionKind.WORKFLOW) await deps.volume.removeSessionWorktrees(id).catch(() => undefined);
      // A delegated (agent-spawned) session archives itself when it settles, keeping the
      // active list clean while its history survives (matches the terminal-status auto-archive
      // in agent-stream for driven runs; stop is the path shell widgets settle through).
      const archiveStamp = row.origin === SessionOrigin.AGENT && !row.archivedAt ? { archivedAt: new Date() } : {};
      await deps.db.update(sessions).set({ status: SessionStatus.STOPPED, endedAt: new Date(), ...archiveStamp }).where(eq(sessions.id, id));
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
