import { EventType, TaskStatus, type RepoManifestEntry } from '@sagewright/shared';
import { and, eq, isNull } from 'drizzle-orm';

import type { Db } from '../db/client';
import { inboundMessages, tasks } from '../db/schema';
import type { EventStore } from '../events/event-store';
import type { EventBus } from '../events/event-bus';
import type { ContainerExec } from './docker-client';
import { pushAndOpenPrs } from './git-pr';
import type { GithubIdentity } from '../github/github-credential-service';

/** Fixed path the worker image installs its harness launcher to (see worker/Dockerfile). */
export const START_SCRIPT = '/usr/local/bin/start-agent';

// How often we look for queued interjections to forward into the agent's PTY.
const POLL_MS = 1000;
// Coalesce terminal output so a chatty agent doesn't append one DB row per write.
const FLUSH_MS = 150;

// Never resurrect a task that already reached a terminal state with a late STATUS event.
const TERMINAL_GUARD = new Set<TaskStatus>([TaskStatus.STOPPED, TaskStatus.DONE, TaskStatus.FAILED]);

interface RunInput {
  taskId: string;
  containerId: string;
  manifest: RepoManifestEntry[];
  sessionDir: string;
  githubIdentity?: GithubIdentity;
}

interface AgentRunnerDeps {
  db: Db;
  eventStore: EventStore;
  eventBus: EventBus;
  exec: ContainerExec;
  // Tear down the box once the run ends — unlike interactive sessions, a headless
  // worker has no human to dismiss it, and the old worker process used to self-exit.
  retire: (containerId: string) => Promise<void>;
}

type Event = { type: EventType; payload: Record<string, unknown> };

/** A lone repo gets its own worktree as the cwd; multiple repos share the session root. */
const agentCwd = (sessionDir: string, manifest: RepoManifestEntry[]): string =>
  manifest.length === 1 ? manifest[0].path : sessionDir;

export const createAgentRunner = (deps: AgentRunnerDeps) => {
  // Persist + publish events, mirroring STATUS → tasks.status and PR_OPENED → tasks.prUrl. The
  // events table has a unique (taskId, seq) index, so appends MUST be serialized; callers chain
  // through `emit` which is itself awaited in order via the per-run mutex below.
  const persist = async (taskId: string, events: Event[]): Promise<void> => {
    const stored = await deps.eventStore.append(taskId, events);
    for (const e of stored) {
      deps.eventBus.publish(taskId, e);
      if (e.type === EventType.STATUS && typeof e.payload['status'] === 'string') {
        const [current] = await deps.db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
        if (current && TERMINAL_GUARD.has(current.status as TaskStatus)) continue;
        await deps.db.update(tasks).set({ status: e.payload['status'] as TaskStatus }).where(eq(tasks.id, taskId));
      }
      if (e.type === EventType.PR_OPENED && typeof e.payload['url'] === 'string') {
        await deps.db.update(tasks).set({ prUrl: e.payload['url'] as string }).where(eq(tasks.id, taskId));
      }
    }
  };

  // One serialized append chain per run: output, interjections, and status never race on seq.
  const createEmitter = (taskId: string) => {
    let chain: Promise<void> = Promise.resolve();
    const emit = (events: Event[]): Promise<void> => {
      chain = chain.then(() => persist(taskId, events));
      return chain;
    };
    // Drain queued appends — callers await this before reading exit status / retiring.
    return { emit, drain: (): Promise<void> => chain };
  };

  // Drive the agent over `docker exec`: stream its PTY output as OUTPUT events, forward
  // interjections, await its exit, and return the exit code. No status decision, no PR,
  // no retire — that policy belongs to the caller (headless run vs workflow step).
  const streamAgentSession = async (
    input: RunInput,
    emit: (events: Event[]) => Promise<void>,
    drain: () => Promise<void>,
  ): Promise<number | null> => {
    const { taskId, containerId, manifest } = input;
    await emit([{ type: EventType.STATUS, payload: { status: TaskStatus.RUNNING } }]);

    const session = await deps.exec.startAgent(containerId, {
      cmd: [START_SCRIPT],
      workingDir: agentCwd(input.sessionDir, manifest),
      env: ['TERM=xterm-256color'],
    });

    // Coalesce raw PTY bytes into OUTPUT events (the headless transcript).
    let buffer = '';
    let flushTimer: NodeJS.Timeout | null = null;
    const flush = (): void => {
      flushTimer = null;
      const chunk = buffer;
      buffer = '';
      if (chunk) void emit([{ type: EventType.OUTPUT, payload: { chunk } }]);
    };
    session.stream.on('data', (b: Buffer) => {
      buffer += b.toString('utf8');
      if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
    });

    // Forward UI interjections (inbound messages) into the agent's stdin as keystrokes.
    const poll = setInterval(() => {
      void (async () => {
        const pending = await deps.db
          .select()
          .from(inboundMessages)
          .where(and(eq(inboundMessages.taskId, taskId), isNull(inboundMessages.consumedAt)));
        if (!pending.length) return;
        await deps.db
          .update(inboundMessages)
          .set({ consumedAt: new Date() })
          .where(and(eq(inboundMessages.taskId, taskId), isNull(inboundMessages.consumedAt)));
        for (const m of pending) {
          session.write(`${m.body}\n`);
          await emit([{ type: EventType.USER_MESSAGE, payload: { text: m.body } }]);
        }
      })();
    }, POLL_MS);

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

  const run = async (input: RunInput): Promise<void> => {
    const { taskId, containerId, manifest } = input;
    const { emit, drain } = createEmitter(taskId);

    try {
      const exitCode = await streamAgentSession(input, emit, drain);
      if (exitCode !== null && exitCode !== 0) {
        await emit([
          { type: EventType.ERROR, payload: { message: `agent exited with code ${exitCode}` } },
          { type: EventType.STATUS, payload: { status: TaskStatus.FAILED } },
        ]);
        return;
      }

      await emit([{ type: EventType.STATUS, payload: { status: TaskStatus.PUSHING } }]);
      await pushAndOpenPrs({ exec: deps.exec, containerId, taskId, manifest, identity: input.githubIdentity, emit });
      await emit([{ type: EventType.STATUS, payload: { status: TaskStatus.DONE } }]);
    } catch (err) {
      await emit([
        { type: EventType.ERROR, payload: { message: String(err) } },
        { type: EventType.STATUS, payload: { status: TaskStatus.FAILED } },
      ]);
    } finally {
      await drain();
      await deps.retire(containerId).catch(() => undefined);
    }
  };

  // Run one workflow step: stream the agent and settle the step task to DONE/FAILED, but
  // never push a PR — the workflow runner owns the shared branch and pushes once at run end.
  // Returns the exit code so the orchestrator can decide whether to advance, loop, or abort.
  const execStep = async (input: RunInput): Promise<{ exitCode: number | null }> => {
    const { emit, drain } = createEmitter(input.taskId);
    let exitCode: number | null = null;
    try {
      exitCode = await streamAgentSession(input, emit, drain);
      if (exitCode !== null && exitCode !== 0) {
        await emit([
          { type: EventType.ERROR, payload: { message: `step exited with code ${exitCode}` } },
          { type: EventType.STATUS, payload: { status: TaskStatus.FAILED } },
        ]);
      } else {
        await emit([{ type: EventType.STATUS, payload: { status: TaskStatus.DONE } }]);
      }
    } catch (err) {
      await emit([
        { type: EventType.ERROR, payload: { message: String(err) } },
        { type: EventType.STATUS, payload: { status: TaskStatus.FAILED } },
      ]);
    } finally {
      await drain();
      await deps.retire(input.containerId).catch(() => undefined);
    }
    return { exitCode };
  };

  return { run, execStep };
};

export type AgentRunner = ReturnType<typeof createAgentRunner>;
