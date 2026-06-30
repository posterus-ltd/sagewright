import { EventType, SessionStatus, type RepoManifestEntry } from '@sagewright/shared';

import type { Db } from '../db/client';
import type { EventStore } from '../events/event-store';
import type { EventBus } from '../events/event-bus';
import { createAgentStreaming, START_SCRIPT, type StreamOpts } from './agent-stream';
import type { ContainerExec } from './docker-client';
import { pushAndOpenPrs } from './git-pr';
import type { GithubIdentity } from '../github/github-credential-service';

// Re-exported for callers that still reference the worker launcher path by name.
export { START_SCRIPT };

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

export const createAgentRunner = (deps: AgentRunnerDeps) => {
  const { createEmitter, streamAgentSession } = createAgentStreaming(deps);

  const run = async (input: RunInput): Promise<void> => {
    const { taskId, containerId, manifest } = input;
    const { emit, drain } = createEmitter(taskId);

    try {
      const exitCode = await streamAgentSession(input, emit, drain);
      if (exitCode !== null && exitCode !== 0) {
        await emit([
          { type: EventType.ERROR, payload: { message: `agent exited with code ${exitCode}` } },
          { type: EventType.STATUS, payload: { status: SessionStatus.FAILED } },
        ]);
        return;
      }

      await emit([{ type: EventType.STATUS, payload: { status: SessionStatus.PUSHING } }]);
      await pushAndOpenPrs({ exec: deps.exec, containerId, taskId, manifest, identity: input.githubIdentity, emit });
      await emit([{ type: EventType.STATUS, payload: { status: SessionStatus.DONE } }]);
    } catch (err) {
      await emit([
        { type: EventType.ERROR, payload: { message: String(err) } },
        { type: EventType.STATUS, payload: { status: SessionStatus.FAILED } },
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
          { type: EventType.STATUS, payload: { status: SessionStatus.FAILED } },
        ]);
      } else {
        await emit([{ type: EventType.STATUS, payload: { status: SessionStatus.DONE } }]);
      }
    } catch (err) {
      await emit([
        { type: EventType.ERROR, payload: { message: String(err) } },
        { type: EventType.STATUS, payload: { status: SessionStatus.FAILED } },
      ]);
    } finally {
      await drain();
      await deps.retire(input.containerId).catch(() => undefined);
    }
    return { exitCode };
  };

  // Drive one interactive turn. Like run() but the agent's life is decoupled from any
  // socket: on turn exit the session goes DETACHED (alive, resumable) — NOT done — and the
  // box is NOT retired. `opts` carries the resume command + the live socket fan-out.
  const runInteractive = async (input: RunInput, opts: StreamOpts = {}): Promise<number | null> => {
    const { emit, drain } = createEmitter(input.taskId);
    let exitCode: number | null = null;
    try {
      exitCode = await streamAgentSession(input, emit, drain, { cmd: opts.cmd ?? [START_SCRIPT], onSession: opts.onSession, onData: opts.onData });
      await emit([{ type: EventType.STATUS, payload: { status: SessionStatus.DETACHED } }]);
    } catch (err) {
      await emit([
        { type: EventType.ERROR, payload: { message: String(err) } },
        { type: EventType.STATUS, payload: { status: SessionStatus.FAILED } },
      ]);
    } finally {
      await drain();
      // No retire — the container stays up so the human can resume the session.
    }
    return exitCode;
  };

  // Finalize an interactive session the human dismissed: push every changed repo, open PRs,
  // settle DONE, and retire the box. Reuses the same git/PR flow as a headless run.
  const complete = async (input: Pick<RunInput, 'taskId' | 'containerId' | 'manifest' | 'githubIdentity'>): Promise<void> => {
    const { emit, drain } = createEmitter(input.taskId);
    try {
      await emit([{ type: EventType.STATUS, payload: { status: SessionStatus.PUSHING } }]);
      await pushAndOpenPrs({
        exec: deps.exec,
        containerId: input.containerId,
        taskId: input.taskId,
        manifest: input.manifest,
        identity: input.githubIdentity,
        emit,
      });
      await emit([{ type: EventType.STATUS, payload: { status: SessionStatus.DONE } }]);
    } catch (err) {
      await emit([
        { type: EventType.ERROR, payload: { message: String(err) } },
        { type: EventType.STATUS, payload: { status: SessionStatus.FAILED } },
      ]);
    } finally {
      await drain();
      await deps.retire(input.containerId).catch(() => undefined);
    }
  };

  return { run, execStep, runInteractive, complete };
};

export type AgentRunner = ReturnType<typeof createAgentRunner>;
