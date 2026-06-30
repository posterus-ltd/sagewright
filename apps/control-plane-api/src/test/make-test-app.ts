import { DataType, newDb } from 'pg-mem';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';

import { buildApp, type AppDeps } from '../app';
import { loadConfig } from '../config';
import { createSecretCipher } from '../crypto/secret-cipher';
import * as schema from '../db/schema';
import { createEventBus } from '../events/event-bus';
import { createEventStore } from '../events/event-store';
import type { Volume } from '../git/volume';
import type { Scheduler } from '../scheduled-prompts/scheduler';
import { createRepoService } from '../repos/repo-service';
import { createSessionRuntime } from '../sessions/session-runtime';
import { createSessionService } from '../sessions/session-service';
import { createTaskService } from '../tasks/task-service';
import type { SpawnInput } from '../tasks/worker-spawner';
import { createUserEnvService } from '../user-env/user-env-service';
import { createGithubCredentialService } from '../github/github-credential-service';
import { createUserSettingsService } from '../user-settings/user-settings-service';
import { createCanvasLayoutService } from '../canvas-layout/canvas-layout-service';
import { createWorkflowService } from '../workflows/workflow-service';
import type { WorkerRegistry } from '../workers/worker-registry';

// Final-state schema (post-0003) for pg-mem. Adaptations:
//   1. gen_random_uuid() registered manually (not built-in to pg-mem).
//   2. FK constraints executed after all tables exist.
//   3. events unique index created in one shot (final state).
const TABLE_STMTS = [
  `CREATE TABLE "repos" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_key" text NOT NULL,
    "url" text NOT NULL,
    "slug" text NOT NULL,
    "default_branch" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE ("user_key", "slug")
  )`,
  `CREATE TABLE "scheduled_prompts" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "cron" text NOT NULL,
    "prompt" text NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_by" text NOT NULL,
    "worker_image" text,
    "last_run_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE "sessions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "kind" text NOT NULL,
    "name" text,
    "prompt" text,
    "status" text DEFAULT 'queued' NOT NULL,
    "branch" text,
    "pr_url" text,
    "created_by" text NOT NULL,
    "container_id" text,
    "scheduled_prompt_id" uuid,
    "parent_session_id" uuid,
    "workflow_id" uuid,
    "workflow_step_key" text,
    "current_step_key" text,
    "iteration" integer,
    "error" text,
    "trigger_context" jsonb,
    "archived_at" timestamp with time zone,
    "worker_image" text,
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE "events" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "session_id" uuid NOT NULL,
    "seq" bigint NOT NULL,
    "type" text NOT NULL,
    "payload" jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE "inbound_messages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "session_id" uuid NOT NULL,
    "body" text NOT NULL,
    "consumed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE "user_envs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_key" text NOT NULL UNIQUE,
    "env_encrypted" text NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE "github_credentials" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_key" text NOT NULL UNIQUE,
    "token_encrypted" text NOT NULL,
    "source" text NOT NULL,
    "login" text NOT NULL,
    "name" text,
    "email" text NOT NULL,
    "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE "canvas_layouts" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_key" text NOT NULL UNIQUE,
    "layout" jsonb NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE "user_settings" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_key" text NOT NULL UNIQUE,
    "default_worker_image" text,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE "workflows" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "definition" jsonb NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_by" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `ALTER TABLE "events" ADD CONSTRAINT "events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE "sessions" ADD CONSTRAINT "sessions_scheduled_prompt_id_scheduled_prompts_id_fk" FOREIGN KEY ("scheduled_prompt_id") REFERENCES "public"."scheduled_prompts"("id") ON DELETE set null ON UPDATE no action`,
  `ALTER TABLE "sessions" ADD CONSTRAINT "sessions_parent_session_id_sessions_id_fk" FOREIGN KEY ("parent_session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE "sessions" ADD CONSTRAINT "sessions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE set null ON UPDATE no action`,
  `CREATE UNIQUE INDEX "events_session_seq_idx" ON "events" USING btree ("session_id","seq")`,
  `CREATE INDEX "events_session_created_idx" ON "events" USING btree ("session_id","created_at")`,
];

/** Fake worker registry for tests; returns one worker by default. */
export const fakeWorkerRegistry = (over: Partial<WorkerRegistry> = {}): WorkerRegistry => ({
  list: async () => [{ id: 'w', image: 'w', name: 'W', description: '' }],
  ...over,
});

/** No-op volume for tests; suites needing specific behaviour override it. */
export const fakeVolume = (over: Partial<Volume> = {}): Volume => ({
  slugFromUrl: (u: string) => u,
  cloneOrPull: async (r) => ({ slug: r.slug, url: r.url, defaultBranch: 'main' }),
  reconcile: () => undefined,
  describe: () => ({ status: 'present', error: null }),
  addSessionWorktrees: async () => [],
  removeSessionWorktrees: async () => undefined,
  removeRepo: async () => undefined,
  ...over,
});

/** No-op scheduler for tests; cron validity defaults to true. */
export const fakeScheduler = (over: Partial<Scheduler> = {}): Scheduler => ({
  start: async () => undefined,
  sync: async () => undefined,
  register: () => undefined,
  unregister: () => undefined,
  stopAll: () => undefined,
  setLogger: () => undefined,
  isValidCron: () => true,
  ...over,
});

/**
 * Creates a pg-mem in-memory Postgres pool patched for drizzle compatibility.
 *
 * pg-mem's Pool does not support:
 *   - query.types.getTypeParser  — drizzle passes custom type parsers; we strip them
 *   - query.rowMode = 'array'    — drizzle uses array rows for ORM queries; we convert
 *     the named-object rows returned by pg-mem back into arrays using result.fields
 *     column order so drizzle's mapResultRow works correctly.
 */
const createPatchedPool = (): unknown => {
  const mem = newDb();

  mem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    implementation: () => randomUUID(),
    impure: true,
  });

  for (const stmt of TABLE_STMTS) {
    mem.public.none(stmt);
  }

  const { Pool: MemPool } = mem.adapters.createPg();

  class PatchedPool extends MemPool {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query(queryConfig: any, valuesOrCallback?: any, callback?: any): any {
      if (queryConfig && typeof queryConfig === 'object') {
        const requestedArrayMode = queryConfig.rowMode === 'array';
        // Strip unsupported fields: types (getTypeParser) and rowMode
        const { types: _types, rowMode: _rowMode, ...rest } = queryConfig;
        const result = super.query(rest, valuesOrCallback, callback);

        if (requestedArrayMode && result && typeof result.then === 'function') {
          // Convert named-object rows → column-ordered arrays for drizzle's mapResultRow
          return result.then((res: any) => {
            if (res?.rows?.length && !Array.isArray(res.rows[0])) {
              const columns: string[] =
                res.fields?.length > 0
                  ? res.fields.map((f: any) => f.name)
                  : Object.keys(res.rows[0]);
              res.rows = res.rows.map((row: any) => columns.map((col: string) => row[col]));
            }
            return res;
          });
        }

        return result;
      }
      return super.query(queryConfig, valuesOrCallback, callback);
    }
  }

  return new PatchedPool();
};

export const makeTestApp = async (
  overrides: Partial<AppDeps> = {},
  opts: { spawner?: { spawn: (i: SpawnInput) => Promise<{ containerId: string }>; retire: (id: string) => Promise<void> } } = {},
): Promise<{
  app: ReturnType<typeof buildApp>;
  db: ReturnType<typeof drizzle>;
}> => {
  const pool = createPatchedPool();
  const db = drizzle(pool as never, { schema });

  const config = loadConfig({
    DATABASE_URL: 'postgres://x',
    APP_PASSWORD: 'pw',
    SESSION_SECRET: 'sec',
    SECRETS_KEY: '0123456789abcdef0123456789abcdef',
    WORKER_IMAGE: 'w',
    CONTROL_PLANE_URL: 'http://c',
  });

  const eventStore = createEventStore(db as never);
  const eventBus = createEventBus();

  // Default fake spawner — tests can override via opts.spawner or overrides
  const defaultSpawner = {
    spawn: async () => ({ containerId: 'test-container' }),
    retire: async () => {},
  };

  const spawner = opts.spawner ?? defaultSpawner;

  const workerRegistry = overrides.workerRegistry ?? fakeWorkerRegistry();
  const defaultVolume = fakeVolume();
  const defaultScheduler = fakeScheduler();

  const userEnvService = createUserEnvService({
    db: db as never,
    cipher: createSecretCipher(config.secretsKey),
  });
  const githubCredentialService = overrides.githubCredentialService ?? createGithubCredentialService({
    db: db as never,
    cipher: createSecretCipher(config.secretsKey),
    config,
    userEnvService,
  });

  const userSettingsService = createUserSettingsService({ db: db as never });

  const canvasLayoutService = createCanvasLayoutService({ db: db as never });

  // Repo service shares whichever volume the app uses, so suites that override the
  // volume (e.g. to spy on removeRepo) see the service drive that same instance.
  const repoService = overrides.repoService ?? createRepoService({
    db: db as never,
    volume: overrides.volume ?? defaultVolume,
    githubCredentialService,
  });

  // No-op agent runner — headless drive is exercised in agent-runner's own unit tests.
  const defaultAgentRunner = {
    run: async () => {},
    execStep: async () => ({ exitCode: 0 }),
    runInteractive: async () => 0,
    complete: async () => {},
  };
  const sessionRuntime = createSessionRuntime({ agentRunner: defaultAgentRunner as never });

  // The single provisioning seam; the task service delegates spawning to it.
  const sessionService = createSessionService({
    db: db as never,
    eventStore,
    eventBus,
    spawner: spawner as never,
    volume: defaultVolume,
    config,
    userEnvService,
    githubCredentialService,
    userSettingsService,
    workerRegistry,
  });

  // Default task service wired to the test db
  const defaultTaskService = createTaskService({
    db: db as never,
    eventStore,
    eventBus,
    spawner: spawner as never,
    agentRunner: defaultAgentRunner as never,
    volume: defaultVolume,
    sessionService,
    sessionRuntime,
  });

  // Default fake container terminal — tests exercising terminals override this.
  const defaultContainerTerminal = {
    exec: async () => {
      throw new Error('containerTerminal not configured in test');
    },
  };

  const workflowService = overrides.workflowService ?? createWorkflowService({ db: db as never });
  // No-op runner by default — the orchestrator loop has its own unit tests.
  const defaultWorkflowRunner = { start: async () => null };

  const app = buildApp({
    config,
    db: db as never,
    eventStore,
    eventBus,
    sessionService,
    sessionRuntime,
    taskService: defaultTaskService,
    repoService,
    userEnvService,
    githubCredentialService,
    userSettingsService,
    canvasLayoutService,
    workflowService,
    workflowRunner: defaultWorkflowRunner,
    containerTerminal: defaultContainerTerminal,
    volume: defaultVolume,
    scheduler: defaultScheduler,
    workerRegistry,
    ...overrides,
  });

  return { app, db };
};
