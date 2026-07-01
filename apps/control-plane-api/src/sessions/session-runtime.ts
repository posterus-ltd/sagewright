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
  // Used for write/resize; it lands asynchronously once `docker exec` resolves, so it
  // is NOT the lock — `live` is.
  exec: AgentExecSession | null;
  // The attach lock. Flipped true SYNCHRONOUSLY at the start of a turn (before any
  // await) and cleared when the turn settles, so two resumes racing through the exec
  // spawn window can't both start a turn. `exec` alone can't do this: it stays null
  // during the spawn, leaving the guard open.
  live: boolean;
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
 * turns so closing the tab never tears the agent down. State is in-process only —
 * after a restart a DETACHED session's entry is rebuilt on demand via `ensure`
 * (the terminal route hydrates it from persistent state before attaching).
 */
export const createSessionRuntime = (deps: SessionRuntimeDeps) => {
  const registry = new Map<string, RuntimeEntry>();

  const fanOut = (entry: RuntimeEntry) => (chunk: Buffer): void => {
    for (const view of entry.viewers) view(chunk);
  };

  // Drive one turn: hand the live exec to the entry, tee output to viewers, and clear
  // the live exec once the turn ends (runInteractive has already stamped DETACHED).
  const driveTurn = (sessionId: string, entry: RuntimeEntry, cmd?: string[]): void => {
    entry.live = true; // claim the lock before any await so a racing resume is refused
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
        entry.live = false;
      });
    void turn.catch(() => undefined);
  };

  const makeEntry = (input: StartSessionInput): RuntimeEntry => ({
    exec: null,
    live: false,
    viewers: new Set(),
    containerId: input.containerId,
    manifest: input.manifest,
    sessionDir: input.sessionDir,
    githubIdentity: input.githubIdentity,
  });

  return {
    /** Begin the first turn of a freshly-spawned interactive session (start-agent). */
    start: (input: StartSessionInput): void => {
      const entry = makeEntry(input);
      registry.set(input.sessionId, entry);
      driveTurn(input.sessionId, entry); // default cmd = start-agent
    },

    /** Whether the session has a runtime entry (live or resting). */
    has: (sessionId: string): boolean => registry.has(sessionId),

    /** Rebuild a RESTING entry from persistent state (post-restart hydration) without
     *  driving a turn — the next keystroke resumes it like any detached session.
     *  A no-op when an entry already exists, so it can never clobber a live turn. */
    ensure: (input: StartSessionInput): void => {
      if (registry.has(input.sessionId)) return;
      registry.set(input.sessionId, makeEntry(input));
    },

    /** Resume a detached session for another turn (continue-agent). Refused if a turn
     *  is already live — the single-exec invariant is the attach lock. */
    resume: (sessionId: string): void => {
      const entry = registry.get(sessionId);
      if (!entry) throw new Error(`no session runtime for ${sessionId}`);
      if (entry.live) throw new Error(`session ${sessionId} already has a live agent`);
      driveTurn(sessionId, entry, CONTINUE_AGENT);
    },

    isLive: (sessionId: string): boolean => registry.get(sessionId)?.live === true,

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
