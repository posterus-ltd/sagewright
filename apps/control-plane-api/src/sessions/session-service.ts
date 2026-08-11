import {
  EventType,
  RESERVED_ENV_KEYS,
  SessionKind,
  SessionOrigin,
  SessionStatus,
  TERMINAL_STATUSES,
  isTerminalStatus,
  modeForKind,
  parseEnvBlob,
  sessionDir,
  worktreeDir,
  type RepoManifestEntry,
  type SessionMode,
} from '@sagewright/shared';
import { and, eq, notInArray } from 'drizzle-orm';

import type { AppConfig } from '../config';
import type { Db } from '../db/client';
import { repos, sessions } from '../db/schema';
import type { EventStore } from '../events/event-store';
import type { EventBus } from '../events/event-bus';
import type { GithubCredentialService, ResolvedGithubCredential } from '../github/github-credential-service';
import type { Volume } from '../git/volume';
import type { SpawnInput } from '../tasks/runner-spawner';
import type { UserEnvService } from '../user-env/user-env-service';
import type { UserSettingsService } from '../user-settings/user-settings-service';
import type { RunnerRegistry } from '../runners/runner-registry';
import type { McpTokenClaims } from '../auth/mcp-token';

interface SessionServiceDeps {
  db: Db;
  eventStore: EventStore;
  eventBus: EventBus;
  spawner: { spawn: (i: SpawnInput) => Promise<{ containerId: string }>; retire: (id: string) => Promise<void> };
  volume: Volume;
  config: AppConfig;
  userEnvService: Pick<UserEnvService, 'get'>;
  githubCredentialService: Pick<GithubCredentialService, 'resolve'>;
  userSettingsService: Pick<UserSettingsService, 'get'>;
  runnerRegistry: RunnerRegistry;
  // Mints the session-scoped MCP bearer injected into the runner (see mcp-token.ts).
  mcpToken: { sign: (claims: McpTokenClaims) => Promise<string> };
}

export interface SpawnSessionInput {
  kind: SessionKind;
  createdBy: string;
  prompt?: string | null;
  /** The CLI a `shell`-kind session runs in its persistent terminal; null otherwise. */
  command?: string | null;
  /** Who initiated the session: 'user' (a human) or 'agent' (spawned over MCP / delegated).
   *  Defaults to 'user' at the column, so omitting it keeps the human-created contract. */
  origin?: SessionOrigin;
  /** Explicit per-session image override; falls back to the user's stored default then the operator config. */
  runnerImage?: string;
  /** A workflow step's parent run/session id (persisted on the row for grouping). */
  parentSessionId?: string;
  scheduledPromptId?: string;
  workflowStepKey?: string;
  iteration?: number;
  /** Branch to materialise/spawn against; defaults to `task/<id>` for standalone sessions. */
  branch?: string;
  /** Pre-created shared worktrees (workflow steps reuse the run's one worktree) —
   *  when present, the per-session worktree creation is skipped. */
  worktrees?: { sessionDir: string; manifest: RepoManifestEntry[] };
}

/** Runtime input rebuilt from persistent state for a session whose in-process
 *  entry was lost (control-plane restart). Shape matches sessionRuntime's
 *  StartSessionInput so the terminal route can `ensure` from it directly. */
export interface HydratedSessionInput {
  sessionId: string;
  containerId: string;
  manifest: RepoManifestEntry[];
  sessionDir: string;
  githubIdentity?: ResolvedGithubCredential;
}

export interface SpawnSessionResult {
  id: string;
  containerId: string;
  branch: string;
  sessionDir: string;
  manifest: RepoManifestEntry[];
  mode: SessionMode;
  githubCredential?: ResolvedGithubCredential;
}

/** A session row reserved (inserted + flipped to PROVISIONING) but not yet spawned.
 *  Carries everything `provisionSession` needs so the heavy container bring-up can run
 *  after the caller has already returned the row (e.g. an interactive HTTP response). */
export interface SessionReservation {
  id: string;
  createdBy: string;
  origin: SessionOrigin;
  runnerImage: string;
  mode: SessionMode;
  prompt: string | null;
  branch: string;
  worktrees?: { sessionDir: string; manifest: RepoManifestEntry[] };
}

// Parse the requester's stored blob and drop operational keys so a user's `.env`
// can't hijack the runner token or repoint the control plane.
const resolveUserEnv = async (
  userEnvService: Pick<UserEnvService, 'get'>,
  userId: string,
): Promise<Record<string, string>> => {
  const parsed = parseEnvBlob(await userEnvService.get(userId));
  for (const k of RESERVED_ENV_KEYS) delete parsed[k];
  return parsed;
};

/**
 * The single seam every run path goes through to bring up a runner container for a
 * session. It owns the provisioning lifecycle — insert → provisioning+branch →
 * validate image → resolve env → materialise worktrees → spawn → persist container
 * id — and the FAILED-on-throw contract (emit ERROR+STATUS(failed), stamp the row,
 * remove worktrees, rethrow). It does NOT decide what drives the agent afterwards;
 * that policy (headless `run`, interactive attach, workflow `execStep`) belongs to
 * the caller, which resumes from the returned context.
 */
export const createSessionService = (deps: SessionServiceDeps) => {
  const emit = async (sessionId: string, batch: { type: EventType; payload: Record<string, unknown> }[]) => {
    const appended = await deps.eventStore.append(sessionId, batch);
    for (const e of appended) deps.eventBus.publish(sessionId, e);
  };

  // Reserve a session row without provisioning it: the cheap prefix that gives a caller
  // an id (and a returnable row) immediately, so an interactive HTTP request can respond
  // before the multi-second container bring-up. Inserting up front also means every
  // downstream failure leaves a visible FAILED session rather than throwing before any
  // row exists — which is invisible to callers like the scheduler.
  const reserveSession = async (input: SpawnSessionInput): Promise<SessionReservation> => {
    const mode = modeForKind(input.kind);
    const prompt = input.prompt ?? null;

    // Runner image precedence: explicit request → user's stored default → operator config
    // fallback. A no-agent SHELL widget instead defaults to the basic CLI runner (skipping
    // the user's agent default), since it hosts a plain command, not a harness.
    const { defaultRunnerImage: stored } = await deps.userSettingsService.get(input.createdBy);
    const runnerImage =
      input.runnerImage ??
      (input.kind === SessionKind.SHELL ? deps.config.cliRunnerImage : stored ?? deps.config.runnerImage);

    const [row] = await deps.db
      .insert(sessions)
      .values({
        kind: input.kind,
        prompt,
        command: input.command ?? null,
        origin: input.origin ?? SessionOrigin.USER,
        runnerImage,
        status: SessionStatus.QUEUED,
        createdBy: input.createdBy,
        branch: null,
        scheduledPromptId: input.scheduledPromptId ?? null,
        parentSessionId: input.parentSessionId ?? null,
        workflowStepKey: input.workflowStepKey ?? null,
        iteration: input.iteration ?? null,
      })
      .returning();
    if (!row) throw new Error('session insert returned no row');

    const branch = input.branch ?? `task/${row.id}`;
    await deps.db.update(sessions).set({ status: SessionStatus.PROVISIONING, branch }).where(eq(sessions.id, row.id));

    return {
      id: row.id,
      createdBy: input.createdBy,
      origin: row.origin as SessionOrigin,
      runnerImage,
      mode,
      prompt,
      branch,
      worktrees: input.worktrees,
    };
  };

  // The heavy half: validate image → resolve env → materialise worktrees → spawn →
  // adopt the container. Owns the FAILED-on-throw contract (cleanup worktrees, flip the
  // row FAILED from a non-terminal state, emit ERROR+STATUS, rethrow). Safe to run
  // detached from the request that reserved the session.
  const provisionSession = async (reservation: SessionReservation): Promise<SpawnSessionResult> => {
    const { id, createdBy, origin, runnerImage, mode, prompt, branch, worktrees } = reservation;
    try {
      // Reject an unknown user-chosen image (security: can't spawn an arbitrary image). The operator's
      // config default is trusted and skips this check so the default path never breaks when no images
      // are labeled yet. Inside the try so a bad image surfaces as a FAILED session.
      if (runnerImage !== deps.config.runnerImage) {
        const runners = await deps.runnerRegistry.list();
        if (!runners.some((w) => w.image === runnerImage)) {
          throw new Error(`unknown runner image: ${runnerImage}`);
        }
      }

      // The requester's stored env overrides the runner's baked secrets AND the
      // runner image defaults. GitHub auth is resolved structurally so the same
      // user credential drives control-plane git, runner git/gh, and PR commits.
      const userEnv = await resolveUserEnv(deps.userEnvService, createdBy);
      const githubCredential = await deps.githubCredentialService.resolve(createdBy);
      if (githubCredential) userEnv.GITHUB_TOKEN = githubCredential.token;

      // Standalone sessions materialise their own per-session worktrees; a workflow
      // step reuses the run's one shared worktree (passed in) so code carries over.
      let dir = worktrees?.sessionDir ?? sessionDir(id);
      let manifest = worktrees?.manifest;
      if (!manifest) {
        // Standalone sessions always branch as `task/<id>` — which is exactly the
        // volume's default — so we don't pass `branch` here; the workflow-step path
        // (which needs `workflow/<runId>`) supplies its own pre-made worktrees above.
        const configured = await deps.db.select().from(repos).where(eq(repos.userId, createdBy));
        manifest = await deps.volume.addSessionWorktrees(
          id,
          configured.map((r) => ({ url: r.url, slug: r.slug })),
          githubCredential?.token,
        );
        dir = sessionDir(id);
      }

      // Mint a session-scoped MCP bearer so the agent can call the /mcp tools back as
      // this session's user (spawn children, schedule jobs, create workflows). Scoped to
      // this exact session id, which becomes the parent of anything it spawns.
      const mcpToken = await deps.mcpToken.sign({ userId: createdBy, sessionId: id });

      const { containerId } = await deps.spawner.spawn({
        taskId: id,
        mode,
        prompt: prompt ?? undefined,
        manifest,
        sessionDir: dir,
        userEnv,
        runnerImage,
        mcpToken,
        mcpUrl: deps.config.mcpPublicUrl,
      });
      // Adopt the container only if the session is still provisioning. A stop that
      // landed mid-spawn already settled the row terminal — adopting the box then
      // would leak it forever (the boot reconciler skips terminal rows), so retire
      // it and abort the drive instead.
      const adopted = await deps.db
        .update(sessions)
        .set({ containerId })
        .where(and(eq(sessions.id, id), eq(sessions.status, SessionStatus.PROVISIONING)))
        .returning();
      if (!adopted.length) {
        await deps.spawner.retire(containerId).catch(() => undefined);
        throw new Error(`session ${id} settled during provisioning`);
      }

      return { id, containerId, branch, sessionDir: dir, manifest, mode, githubCredential };
    } catch (err) {
      await deps.volume.removeSessionWorktrees(id).catch(() => undefined);
      // Flip to FAILED only from a non-terminal state so a user's STOPPED (or another
      // settled outcome) is never overwritten; emit the failure events only when the
      // flip actually happened, keeping the transcript consistent with the row.
      // A delegated (agent-spawned) session archives itself the moment it settles, so a
      // short-lived one leaves a trace in history without cluttering the active list.
      const archiveStamp = origin === SessionOrigin.AGENT ? { archivedAt: new Date() } : {};
      const flipped = await deps.db
        .update(sessions)
        .set({ status: SessionStatus.FAILED, ...archiveStamp })
        .where(and(eq(sessions.id, id), notInArray(sessions.status, [...TERMINAL_STATUSES])))
        .returning();
      if (flipped.length) {
        await emit(id, [
          { type: EventType.ERROR, payload: { message: String(err) } },
          { type: EventType.STATUS, payload: { status: SessionStatus.FAILED } },
        ]);
      }
      throw err;
    }
  };

  // The single seam every synchronous run path goes through: reserve then provision in
  // one awaited call. The interactive HTTP path instead calls the two halves separately
  // so it can return the reserved row before provisioning finishes.
  const spawnSession = async (input: SpawnSessionInput): Promise<SpawnSessionResult> =>
    provisionSession(await reserveSession(input));

  /** Rebuild an interactive session's runtime input from persistent state so a
   *  DETACHED session survives a control-plane restart: the container id comes from
   *  the row, the manifest from the worktrees still on disk joined with the creator's
   *  configured repos, and the GitHub identity is re-resolved. Returns null when
   *  there is nothing to rehydrate (missing, non-interactive, terminal, no box). */
  const hydrateSession = async (sessionId: string): Promise<HydratedSessionInput | null> => {
    const [row] = await deps.db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    if (!row || row.kind !== SessionKind.INTERACTIVE || !row.containerId) return null;
    if (isTerminalStatus(row.status as SessionStatus)) return null;

    const slugs = await deps.volume.listSessionWorktrees(sessionId);
    const configured = await deps.db.select().from(repos).where(eq(repos.userId, row.createdBy));
    const bySlug = new Map(configured.map((r) => [r.slug, r]));
    const manifest: RepoManifestEntry[] = slugs.map((slug) => ({
      slug,
      url: bySlug.get(slug)?.url ?? '',
      defaultBranch: bySlug.get(slug)?.defaultBranch ?? null,
      path: worktreeDir(sessionId, slug),
    }));
    const githubCredential = await deps.githubCredentialService.resolve(row.createdBy);

    return {
      sessionId,
      containerId: row.containerId,
      manifest,
      sessionDir: sessionDir(sessionId),
      githubIdentity: githubCredential ?? undefined,
    };
  };

  return { spawnSession, reserveSession, provisionSession, hydrateSession };
};

export type SessionService = ReturnType<typeof createSessionService>;
