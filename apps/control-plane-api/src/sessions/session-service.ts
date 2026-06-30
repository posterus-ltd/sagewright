import {
  EventType,
  RESERVED_ENV_KEYS,
  TaskStatus,
  modeForKind,
  parseEnvBlob,
  sessionDir,
  type RepoManifestEntry,
  type SessionKind,
  type SessionMode,
} from '@sagewright/shared';
import { eq } from 'drizzle-orm';

import type { AppConfig } from '../config';
import type { Db } from '../db/client';
import { repos, tasks } from '../db/schema';
import type { EventStore } from '../events/event-store';
import type { EventBus } from '../events/event-bus';
import type { GithubCredentialService, ResolvedGithubCredential } from '../github/github-credential-service';
import type { Volume } from '../git/volume';
import type { SpawnInput } from '../tasks/worker-spawner';
import type { UserEnvService } from '../user-env/user-env-service';
import type { UserSettingsService } from '../user-settings/user-settings-service';
import type { WorkerRegistry } from '../workers/worker-registry';

interface SessionServiceDeps {
  db: Db;
  eventStore: EventStore;
  eventBus: EventBus;
  spawner: { spawn: (i: SpawnInput) => Promise<{ containerId: string }>; retire: (id: string) => Promise<void> };
  volume: Volume;
  config: AppConfig;
  userEnvService: Pick<UserEnvService, 'get'>;
  githubCredentialService: Pick<GithubCredentialService, 'resolve'>;
  userSettingsService: Pick<UserSettingsService, 'getDefaultWorker'>;
  workerRegistry: WorkerRegistry;
}

export interface SpawnSessionInput {
  kind: SessionKind;
  createdBy: string;
  prompt?: string | null;
  /** Explicit per-session image override; falls back to the user's stored default then the operator config. */
  workerImage?: string;
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

export interface SpawnSessionResult {
  id: string;
  containerId: string;
  branch: string;
  sessionDir: string;
  manifest: RepoManifestEntry[];
  mode: SessionMode;
  githubCredential?: ResolvedGithubCredential;
}

// Parse the requester's stored blob and drop operational keys so a user's `.env`
// can't hijack the worker token or repoint the control plane.
const resolveUserEnv = async (
  userEnvService: Pick<UserEnvService, 'get'>,
  userKey: string,
): Promise<Record<string, string>> => {
  const parsed = parseEnvBlob(await userEnvService.get(userKey));
  for (const k of RESERVED_ENV_KEYS) delete parsed[k];
  return parsed;
};

/**
 * The single seam every run path goes through to bring up a worker container for a
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

  const spawnSession = async (input: SpawnSessionInput): Promise<SpawnSessionResult> => {
    const mode = modeForKind(input.kind);
    const prompt = input.prompt ?? null;

    // Worker image precedence: explicit request → user's stored default → operator config fallback.
    const stored = await deps.userSettingsService.getDefaultWorker(input.createdBy);
    const workerImage = input.workerImage ?? stored ?? deps.config.workerImage;

    // Insert the row up front so every failure path below leaves a visible FAILED
    // session (with the reason in its transcript) rather than throwing before any
    // row exists — which is invisible to callers like the scheduler.
    const [row] = await deps.db
      .insert(tasks)
      .values({
        mode,
        prompt,
        workerImage,
        status: TaskStatus.QUEUED,
        createdBy: input.createdBy,
        branch: null,
        scheduledPromptId: input.scheduledPromptId ?? null,
        workflowRunId: input.parentSessionId ?? null,
        workflowStepKey: input.workflowStepKey ?? null,
        iteration: input.iteration ?? null,
      })
      .returning();

    const branch = input.branch ?? `task/${row.id}`;
    await deps.db.update(tasks).set({ status: TaskStatus.PROVISIONING, branch }).where(eq(tasks.id, row.id));

    try {
      // Reject an unknown user-chosen image (security: can't spawn an arbitrary image). The operator's
      // config default is trusted and skips this check so the default path never breaks when no images
      // are labeled yet. Inside the try so a bad image surfaces as a FAILED session.
      if (workerImage !== deps.config.workerImage) {
        const workers = await deps.workerRegistry.list();
        if (!workers.some((w) => w.image === workerImage)) {
          throw new Error(`unknown worker image: ${workerImage}`);
        }
      }

      // The requester's stored env overrides the worker's baked secrets AND the
      // worker image defaults. GitHub auth is resolved structurally so the same
      // user credential drives control-plane git, worker git/gh, and PR commits.
      const userEnv = await resolveUserEnv(deps.userEnvService, input.createdBy);
      const githubCredential = await deps.githubCredentialService.resolve(input.createdBy);
      if (githubCredential) userEnv.GITHUB_TOKEN = githubCredential.token;

      // Standalone sessions materialise their own per-session worktrees; a workflow
      // step reuses the run's one shared worktree (passed in) so code carries over.
      let dir = input.worktrees?.sessionDir ?? sessionDir(row.id);
      let manifest = input.worktrees?.manifest;
      if (!manifest) {
        // Standalone sessions always branch as `task/<id>` — which is exactly the
        // volume's default — so we don't pass `branch` here; the workflow-step path
        // (which needs `workflow/<runId>`) supplies its own pre-made worktrees above.
        const configured = await deps.db.select().from(repos).where(eq(repos.userKey, input.createdBy));
        manifest = await deps.volume.addSessionWorktrees(
          row.id,
          configured.map((r) => ({ url: r.url, slug: r.slug })),
          githubCredential?.token,
        );
        dir = sessionDir(row.id);
      }

      const { containerId } = await deps.spawner.spawn({
        taskId: row.id,
        mode,
        prompt: prompt ?? undefined,
        manifest,
        sessionDir: dir,
        userEnv,
        workerImage,
      });
      await deps.db.update(tasks).set({ containerId }).where(eq(tasks.id, row.id));

      return { id: row.id, containerId, branch, sessionDir: dir, manifest, mode, githubCredential };
    } catch (err) {
      await deps.volume.removeSessionWorktrees(row.id).catch(() => undefined);
      await emit(row.id, [
        { type: EventType.ERROR, payload: { message: String(err) } },
        { type: EventType.STATUS, payload: { status: TaskStatus.FAILED } },
      ]);
      await deps.db.update(tasks).set({ status: TaskStatus.FAILED }).where(eq(tasks.id, row.id));
      throw err;
    }
  };

  return { spawnSession };
};

export type SessionService = ReturnType<typeof createSessionService>;
