import type { RepoManifestEntry, TerminalSize } from '@sagewright/shared';

import type { GithubIdentity } from '../github/github-credential-service';
import type { AgentExecSession } from '../tasks/docker-client';
import type { AgentRunner } from '../tasks/agent-runner';

/** A consumer of live PTY bytes (an attached browser socket). */
export type Sink = (chunk: Buffer) => void;

/** The continue command each worker image bakes in to resume its harness (see Dockerfile). */
const CONTINUE_AGENT = ['continue-agent'];

interface RuntimeEntry {
  // The live agent exec, or null when the session is DETACHED (resting between turns).
  // A non-null exec IS the attach lock: only one turn runs per session at a time.
  exec: AgentExecSession | null;
  viewers: Set<Sink>;
  containerId: string;
  manifest: RepoManifestEntry[];
  sessionDir: string;
  githubIdentity?: GithubIdentity;
}

export interface StartSessionInput {
  sessionId: string;
  containerId: string;
  manifest: RepoManifestEntry[];
  sessionDir: string;
  githubIdentity?: GithubIdentity;
}

interface SessionRuntimeDeps {
  agentRunner: Pick<AgentRunner, 'runInteractive' | 'complete'>;
}

/**
 * In-process registry of interactive sessions, decoupled from any browser socket.
 * Owns at most one live agent exec per session (the attach lock), tees that exec's
 * PTY output to every attached viewer, and keeps the session alive (DETACHED) between
 * turns so closing the tab never tears the agent down. State is in-process only — the
 * boot reconciler (Phase 3) re-establishes it after a restart.
 */
export const createSessionRuntime = (deps: SessionRuntimeDeps) => {
  const registry = new Map<string, RuntimeEntry>();

  const fanOut = (entry: RuntimeEntry) => (chunk: Buffer): void => {
    for (const view of entry.viewers) view(chunk);
  };

  // Drive one turn: hand the live exec to the entry, tee output to viewers, and clear
  // the live exec once the turn ends (runInteractive has already stamped DETACHED).
  const driveTurn = (sessionId: string, entry: RuntimeEntry, cmd?: string[]): void => {
    const turn = deps.agentRunner
      .runInteractive(
        {
          taskId: sessionId,
          containerId: entry.containerId,
          manifest: entry.manifest,
          sessionDir: entry.sessionDir,
          githubIdentity: entry.githubIdentity,
        },
        { cmd, onSession: (s) => { entry.exec = s; }, onData: fanOut(entry) },
      )
      .finally(() => {
        entry.exec = null;
      });
    void turn.catch(() => undefined);
  };

  return {
    /** Begin the first turn of a freshly-spawned interactive session (start-agent). */
    start: (input: StartSessionInput): void => {
      const entry: RuntimeEntry = {
        exec: null,
        viewers: new Set(),
        containerId: input.containerId,
        manifest: input.manifest,
        sessionDir: input.sessionDir,
        githubIdentity: input.githubIdentity,
      };
      registry.set(input.sessionId, entry);
      driveTurn(input.sessionId, entry); // default cmd = start-agent
    },

    /** Resume a detached session for another turn (continue-agent). Refused if a turn
     *  is already live — the single-exec invariant is the attach lock. */
    resume: (sessionId: string): void => {
      const entry = registry.get(sessionId);
      if (!entry) throw new Error(`no session runtime for ${sessionId}`);
      if (entry.exec) throw new Error(`session ${sessionId} already has a live agent`);
      driveTurn(sessionId, entry, CONTINUE_AGENT);
    },

    isLive: (sessionId: string): boolean => registry.get(sessionId)?.exec != null,

    write: (sessionId: string, data: string): void => {
      registry.get(sessionId)?.exec?.write(data);
    },

    resize: (sessionId: string, size: TerminalSize): void => {
      void registry.get(sessionId)?.exec?.resize(size);
    },

    /** Attach a viewer to the session's live output. Returns a detach function; detaching
     *  only removes the viewer — it never touches the exec, so the agent runs on. */
    attach: (sessionId: string, sink: Sink): (() => void) => {
      const entry = registry.get(sessionId);
      if (!entry) return () => undefined;
      entry.viewers.add(sink);
      return () => {
        entry.viewers.delete(sink);
      };
    },

    /** Finalize the session: push/open PRs, settle DONE, retire the box, drop the entry. */
    complete: async (sessionId: string): Promise<void> => {
      const entry = registry.get(sessionId);
      if (!entry) return;
      await deps.agentRunner.complete({
        taskId: sessionId,
        containerId: entry.containerId,
        manifest: entry.manifest,
        githubIdentity: entry.githubIdentity,
      });
      registry.delete(sessionId);
    },
  };
};

export type SessionRuntime = ReturnType<typeof createSessionRuntime>;
