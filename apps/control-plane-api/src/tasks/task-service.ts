import { EventType, RESERVED_ENV_KEYS, TaskStatus, parseEnvBlob, sessionDir, type CreateTaskInput, type SessionMode, type Task, type UpdateTaskInput } from '@sagewright/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';

import type { AppConfig } from '../config';
import type { Db } from '../db/client';
import { events, inboundMessages, repos, tasks } from '../db/schema';
import type { EventStore } from '../events/event-store';
import type { EventBus } from '../events/event-bus';
import type { AgentRunner } from './agent-runner';
import type { SpawnInput } from './worker-spawner';
import type { UserEnvService } from '../user-env/user-env-service';
import type { UserSettingsService } from '../user-settings/user-settings-service';
import type { WorkerRegistry } from '../workers/worker-registry';
import type { Volume } from '../git/volume';
import type { GithubCredentialService } from '../github/github-credential-service';

interface TaskServiceDeps {
  db: Db;
  eventStore: EventStore;
  eventBus: EventBus;
  spawner: { spawn: (i: SpawnInput) => Promise<{ containerId: string }>; retire: (id: string) => Promise<void> };
  agentRunner: AgentRunner;
  volume: Volume;
  config: AppConfig;
  userEnvService: UserEnvService;
  githubCredentialService: GithubCredentialService;
  userSettingsService: UserSettingsService;
  workerRegistry: WorkerRegistry;
}

// Parse the requester's stored blob and drop operational keys so a user's `.env`
// can't hijack the worker token or repoint the control plane.
const resolveUserEnv = async (userEnvService: UserEnvService, userKey: string): Promise<Record<string, string>> => {
  const parsed = parseEnvBlob(await userEnvService.get(userKey));
  for (const k of RESERVED_ENV_KEYS) delete parsed[k];
  return parsed;
};

interface CreateOpts {
  mode?: SessionMode;
  scheduledPromptId?: string;
}

export const rowToTask = (r: typeof tasks.$inferSelect): Task => ({
  id: r.id,
  mode: r.mode as SessionMode,
  name: r.name,
  prompt: r.prompt,
  workerImage: r.workerImage,
  status: r.status as TaskStatus,
  branch: r.branch,
  prUrl: r.prUrl,
  createdBy: r.createdBy,
  containerId: r.containerId,
  scheduledPromptId: r.scheduledPromptId,
  workflowRunId: r.workflowRunId,
  workflowStepKey: r.workflowStepKey,
  iteration: r.iteration,
  archivedAt: r.archivedAt ? r.archivedAt.toISOString() : null,
  createdAt: r.createdAt.toISOString(),
});

export const createTaskService = (deps: TaskServiceDeps) => {
  const emit = async (taskId: string, events: { type: EventType; payload: Record<string, unknown> }[]) => {
    const appended = await deps.eventStore.append(taskId, events);
    for (const e of appended) deps.eventBus.publish(taskId, e);
  };

  const create = async (input: CreateTaskInput, createdBy: string, opts: CreateOpts = {}): Promise<Task> => {
    const mode: SessionMode = opts.mode ?? 'interactive';
    const prompt = input.prompt ?? null;

    // Precedence: explicit request → user's stored default → operator config fallback.
    const stored = await deps.userSettingsService.getDefaultWorker(createdBy);
    const workerImage = input.workerImage ?? stored ?? deps.config.workerImage;

    // Insert the row up front so every failure path below leaves a visible FAILED
    // session in the list (with the reason in its transcript) rather than throwing
    // before any row exists — which is invisible to callers like the scheduler.
    const [row] = await deps.db
      .insert(tasks)
      .values({
        mode,
        prompt,
        workerImage,
        status: TaskStatus.QUEUED,
        createdBy,
        branch: null,
        scheduledPromptId: opts.scheduledPromptId ?? null,
      })
      .returning();

    await deps.db
      .update(tasks)
      .set({ status: TaskStatus.PROVISIONING, branch: `task/${row.id}` })
      .where(eq(tasks.id, row.id));

    let containerId: string;
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
      const userEnv = await resolveUserEnv(deps.userEnvService, createdBy);
      const githubCredential = await deps.githubCredentialService.resolve(createdBy);
      if (githubCredential) userEnv.GITHUB_TOKEN = githubCredential.token;

      // Clone/pull the creator's configured repos onto the shared volume and create
      // this session's per-repo worktrees, then spawn the worker pointing at them.
      const configured = await deps.db.select().from(repos).where(eq(repos.userKey, createdBy));
      const manifest = await deps.volume.addSessionWorktrees(
        row.id,
        configured.map((r) => ({ url: r.url, slug: r.slug })),
        githubCredential?.token,
      );
      ({ containerId } = await deps.spawner.spawn({
        taskId: row.id,
        mode,
        prompt: prompt ?? undefined,
        manifest,
        sessionDir: sessionDir(row.id),
        userEnv,
        workerImage,
      }));

      await deps.db.update(tasks).set({ containerId }).where(eq(tasks.id, row.id));

      if (mode === 'headless') {
        // The box is up; drive the agent over `docker exec` and stream it as the transcript.
        // Fire-and-forget: the run owns its own status/PR events; surface a crash as FAILED.
        void deps.agentRunner
          .run({ taskId: row.id, containerId, manifest, sessionDir: sessionDir(row.id), githubIdentity: githubCredential })
          .catch(async (err) => {
            await emit(row.id, [
              { type: EventType.ERROR, payload: { message: String(err) } },
              { type: EventType.STATUS, payload: { status: TaskStatus.FAILED } },
            ]);
            await deps.db.update(tasks).set({ status: TaskStatus.FAILED }).where(eq(tasks.id, row.id));
          });
        return { ...rowToTask(row), status: TaskStatus.RUNNING, branch: `task/${row.id}`, containerId };
      }

      // Interactive: nobody drives the box — the human attaches via the terminal route.
      await emit(row.id, [{ type: EventType.STATUS, payload: { status: TaskStatus.RUNNING } }]);
      await deps.db.update(tasks).set({ status: TaskStatus.RUNNING }).where(eq(tasks.id, row.id));
      return { ...rowToTask(row), status: TaskStatus.RUNNING, branch: `task/${row.id}`, containerId };
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

  return {
    create,
    // Standalone sessions only — workflow step rows are owned by their run and shown
    // on the workflow run graph, not in the flat sessions list / canvas.
    list: async (createdBy?: string): Promise<Task[]> => {
      const where = createdBy
        ? and(eq(tasks.createdBy, createdBy), isNull(tasks.workflowRunId))
        : isNull(tasks.workflowRunId);
      const rows = await deps.db.select().from(tasks).where(where).orderBy(desc(tasks.createdAt));
      return rows.map(rowToTask);
    },
    get: async (id: string): Promise<Task | null> => {
      const [row] = await deps.db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
      return row ? rowToTask(row) : null;
    },
    // Rename a session. A blank name clears the custom label back to the default.
    update: async (id: string, input: UpdateTaskInput): Promise<Task | null> => {
      const name = input.name?.trim() || null;
      const [row] = await deps.db.update(tasks).set({ name }).where(eq(tasks.id, id)).returning();
      return row ? rowToTask(row) : null;
    },
    stop: async (id: string): Promise<void> => {
      const [row] = await deps.db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
      if (!row) return;
      if (row.containerId) await deps.spawner.retire(row.containerId);
      await deps.volume.removeSessionWorktrees(id).catch(() => undefined);
      await deps.db.update(tasks).set({ status: TaskStatus.STOPPED }).where(eq(tasks.id, id));
      // Surface the stop in the transcript so a live viewer sees it.
      await emit(id, [{ type: EventType.STATUS, payload: { status: TaskStatus.STOPPED } }]);
    },
    // Hide a finished session from the active list. Reversible — the row stays.
    archive: async (id: string): Promise<void> => {
      await deps.db.update(tasks).set({ archivedAt: new Date() }).where(eq(tasks.id, id));
    },
    // Permanently drop an archived session and its dependent rows.
    remove: async (id: string): Promise<void> => {
      const [row] = await deps.db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
      if (!row) return;
      if (row.containerId) await deps.spawner.retire(row.containerId).catch(() => undefined);
      await deps.volume.removeSessionWorktrees(id).catch(() => undefined);
      await deps.db.delete(inboundMessages).where(eq(inboundMessages.taskId, id));
      await deps.db.delete(events).where(eq(events.taskId, id));
      await deps.db.delete(tasks).where(eq(tasks.id, id));
    },
  };
};

export type TaskService = ReturnType<typeof createTaskService>;
