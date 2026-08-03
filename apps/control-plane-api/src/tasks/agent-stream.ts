import { EventType, SessionStatus, isTerminalStatus, type RepoManifestEntry } from '@sagewright/shared';
import { and, eq, isNull } from 'drizzle-orm';

import type { Db } from '../db/client';
import { inboundMessages, sessions } from '../db/schema';
import type { EventStore } from '../events/event-store';
import type { EventBus } from '../events/event-bus';
import type { AgentExecSession, ContainerExec } from './docker-client';

/** Fixed path the runner image installs its harness launcher to (see runner/Dockerfile). */
export const START_SCRIPT = '/usr/local/bin/start-agent';

// How often we look for queued interjections to forward into the agent's PTY.
const POLL_MS = 1000;
// Coalesce terminal output so a chatty agent doesn't append one DB row per write.
const FLUSH_MS = 150;

// Never resurrect a session that already reached a terminal state with a late STATUS event.
const TERMINAL_GUARD = new Set<SessionStatus>([SessionStatus.STOPPED, SessionStatus.DONE, SessionStatus.FAILED]);

export type Event = { type: EventType; payload: Record<string, unknown> };

export interface StreamInput {
  taskId: string;
  containerId: string;
  manifest: RepoManifestEntry[];
  sessionDir: string;
}

export interface StreamOpts {
  /** Command to exec — `start-agent` for a first turn, `continue-agent` to resume. */
  cmd?: string[];
  /** Hand the live exec to the caller so it can write/resize while the turn runs. */
  onSession?: (session: AgentExecSession) => void;
  /** Tee raw PTY bytes to live viewers (attached sockets) as they arrive, uncoalesced. */
  onData?: (chunk: Buffer) => void;
}

export interface AgentStreamingDeps {
  db: Db;
  eventStore: EventStore;
  eventBus: EventBus;
  exec: ContainerExec;
  /** Interjection poll interval override (tests); defaults to POLL_MS. */
  pollMs?: number;
}

/** A lone repo gets its own worktree as the cwd; multiple repos share the session root. */
const agentCwd = (sessionDir: string, manifest: RepoManifestEntry[]): string =>
  manifest.length === 1 ? manifest[0]!.path : sessionDir;

/**
 * The shared engine for driving an agent over `docker exec`: a serialized event
 * emitter (so appends never race on the unique `(task_id, seq)` index) and the PTY
 * stream pump that emits OUTPUT events (the durable transcript) and optionally tees
 * raw bytes to live sockets. Both the headless driver and the interactive runtime
 * build on this so output is persisted once and fanned everywhere.
 */
export const createAgentStreaming = (deps: AgentStreamingDeps) => {
  // Persist + publish events, mirroring STATUS → sessions.status and PR_OPENED → sessions.prUrl.
  const persist = async (taskId: string, events: Event[]): Promise<void> => {
    const stored = await deps.eventStore.append(taskId, events);
    for (const e of stored) {
      deps.eventBus.publish(taskId, e);
      if (e.type === EventType.STATUS && typeof e.payload['status'] === 'string') {
        const status = e.payload['status'] as SessionStatus;
        const [current] = await deps.db.select().from(sessions).where(eq(sessions.id, taskId)).limit(1);
        if (current && TERMINAL_GUARD.has(current.status as SessionStatus)) continue;
        // Lifecycle stamps ride along with the status mirror: the FIRST running
        // transition starts the clock (a resumed turn keeps the original), and any
        // terminal transition stops it.
        const stamps =
          status === SessionStatus.RUNNING
            ? { startedAt: current?.startedAt ?? new Date() }
            : isTerminalStatus(status)
              ? { endedAt: new Date() }
              : {};
        await deps.db.update(sessions).set({ status, ...stamps }).where(eq(sessions.id, taskId));
      }
      if (e.type === EventType.PR_OPENED && typeof e.payload['url'] === 'string') {
        await deps.db.update(sessions).set({ prUrl: e.payload['url'] as string }).where(eq(sessions.id, taskId));
      }
    }
  };

  // One serialized append chain per session: output, interjections, and status never race on seq.
  const createEmitter = (taskId: string) => {
    let chain: Promise<void> = Promise.resolve();
    const emit = (events: Event[]): Promise<void> => {
      chain = chain.then(() => persist(taskId, events));
      return chain;
    };
    // Drain queued appends — callers await this before reading exit status / retiring.
    return { emit, drain: (): Promise<void> => chain };
  };

  // Drive the agent over `docker exec`: stream its PTY output as OUTPUT events (and tee
  // to live sockets), forward interjections, await its exit, and return the exit code. No
  // status decision, no PR, no retire — that policy belongs to the caller.
  const streamAgentSession = async (
    input: StreamInput,
    emit: (events: Event[]) => Promise<void>,
    drain: () => Promise<void>,
    opts: StreamOpts = {},
  ): Promise<number | null> => {
    const { taskId, containerId, manifest } = input;
    await emit([{ type: EventType.STATUS, payload: { status: SessionStatus.RUNNING } }]);

    const session = await deps.exec.startAgent(containerId, {
      cmd: opts.cmd ?? [START_SCRIPT],
      workingDir: agentCwd(input.sessionDir, manifest),
      env: ['TERM=xterm-256color'],
    });
    opts.onSession?.(session);

    // Coalesce raw PTY bytes into OUTPUT events (the durable transcript); tee raw bytes live.
    let buffer = '';
    let flushTimer: NodeJS.Timeout | null = null;
    const flush = (): void => {
      flushTimer = null;
      const chunk = buffer;
      buffer = '';
      if (chunk) void emit([{ type: EventType.OUTPUT, payload: { chunk } }]);
    };
    session.stream.on('data', (b: Buffer) => {
      opts.onData?.(b);
      buffer += b.toString('utf8');
      if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
    });

    // Forward UI interjections (inbound messages) into the agent's stdin as keystrokes.
    // Consume-and-read is ONE statement: the rows the UPDATE returns are exactly the
    // rows delivered. A separate select-then-update would mark messages consumed that
    // landed between the two statements without ever delivering them.
    const poll = setInterval(() => {
      void (async () => {
        const pending = await deps.db
          .update(inboundMessages)
          .set({ consumedAt: new Date() })
          .where(and(eq(inboundMessages.sessionId, taskId), isNull(inboundMessages.consumedAt)))
          .returning();
        pending.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        for (const m of pending) {
          session.write(`${m.body}\n`);
          await emit([{ type: EventType.USER_MESSAGE, payload: { text: m.body } }]);
        }
      })();
    }, deps.pollMs ?? POLL_MS);

    // The start script runs in the foreground; its exit closes the exec stream.
    await new Promise<void>((resolve) => {
      session.stream.on('end', resolve);
      session.stream.on('close', resolve);
    });
    clearInterval(poll);
    if (flushTimer) clearTimeout(flushTimer);
    flush();
    await drain(); // drain queued appends before reading exit status

    const { exitCode } = await session.inspect();
    return exitCode;
  };

  return { createEmitter, streamAgentSession };
};
