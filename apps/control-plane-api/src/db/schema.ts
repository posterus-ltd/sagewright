import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * The source of truth for who may log in. `id` is the identity key every per-user table
 * references (`user_id` / `created_by`); `username` is only the human login handle and a
 * display label. `passwordHash` is a self-describing scrypt string (see auth/password.ts);
 * `mustChangePassword` is read live in the auth guard so an admin reset takes effect on the
 * user's next request.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('user'),
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const repos = pgTable('repos', {
  id: uuid('id').primaryKey().defaultRandom(),
  // The owning user's id. Repos are per-user: each user has their own list. The physical
  // clone at <vol>/repos/<slug> is shared (deduped by slug) across users who configure the
  // same repo.
  userId: uuid('user_id').notNull(),
  url: text('url').notNull(),
  slug: text('slug').notNull(),
  defaultBranch: text('default_branch'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ userSlugIdx: uniqueIndex('repos_user_id_slug_idx').on(t.userId, t.slug) }));

export const scheduledPrompts = pgTable('scheduled_prompts', {
  id: uuid('id').primaryKey().defaultRandom(),
  cron: text('cron').notNull(),
  prompt: text('prompt').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdBy: uuid('created_by').notNull(),
  runnerImage: text('runner_image'),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workflows = pgTable('workflows', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // Full WorkflowDefinition JSON the user authored (steps, trigger, maxIterations).
  definition: jsonb('definition').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Every run path is one `sessions` row, discriminated by `kind`. A `workflow` parent
 * (the old `workflow_runs` row, now folded in here) owns its `workflow_step` children
 * via `parent_session_id`; standalone interactive/headless/scheduled sessions have no
 * parent. `workflow_id` is set only on the `workflow` parent.
 */
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),
  name: text('name'),
  prompt: text('prompt'),
  status: text('status').notNull().default('queued'),
  branch: text('branch'),
  prUrl: text('pr_url'),
  createdBy: uuid('created_by').notNull(),
  containerId: text('container_id'),
  scheduledPromptId: uuid('scheduled_prompt_id').references(() => scheduledPrompts.id, { onDelete: 'set null' }),
  // A workflow_step points at its workflow parent (cascade so deleting the parent run
  // drops its steps). Null for standalone sessions and the workflow parent itself.
  parentSessionId: uuid('parent_session_id').references((): AnyPgColumn => sessions.id, { onDelete: 'cascade' }),
  // Set only on the kind='workflow' parent (which workflow definition it runs).
  workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'set null' }),
  workflowStepKey: text('workflow_step_key'),
  currentStepKey: text('current_step_key'),
  iteration: integer('iteration'),
  // Human-readable failure reason; surfaced in the UI instead of buried in logs.
  error: text('error'),
  // Trigger payload (e.g. a workflow run's seed input). JSON, nullable.
  triggerContext: jsonb('trigger_context'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  runnerImage: text('runner_image'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  seq: bigint('seq', { mode: 'number' }).notNull(),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  sessionSeqIdx: uniqueIndex('events_session_seq_idx').on(t.sessionId, t.seq),
  sessionCreatedIdx: index('events_session_created_idx').on(t.sessionId, t.createdAt),
}));

export const userEnvs = pgTable('user_envs', {
  id: uuid('id').primaryKey().defaultRandom(),
  // The owning user's id. One env blob per user.
  userId: uuid('user_id').notNull().unique(),
  envEncrypted: text('env_encrypted').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const githubCredentials = pgTable('github_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  // The owning user's id. One credential per user.
  userId: uuid('user_id').notNull().unique(),
  tokenEncrypted: text('token_encrypted').notNull(),
  source: text('source').notNull(),
  login: text('login').notNull(),
  name: text('name'),
  email: text('email').notNull(),
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const canvasLayouts = pgTable('canvas_layouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  // The owning user's id. One layout per user.
  userId: uuid('user_id').notNull().unique(),
  layout: jsonb('layout').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userSettings = pgTable('user_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique(),
  defaultRunnerImage: text('default_runner_image'),
  // Whether this user's agents may call the /mcp endpoint. Defaults true so the
  // capability stays on for everyone unless the user explicitly opts out; read live
  // in the MCP guard so a toggle takes effect on the next call (see auth-plugin.ts).
  mcpEnabled: boolean('mcp_enabled').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const inboundMessages = pgTable('inbound_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
