import { bigint, boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const repos = pgTable('repos', {
  id: uuid('id').primaryKey().defaultRandom(),
  // = displayName today; becomes a real user id once SSO lands. Repos are per-user:
  // each user has their own list. The physical clone at <vol>/repos/<slug> is shared
  // (deduped by slug) across users who configure the same repo.
  userKey: text('user_key').notNull(),
  url: text('url').notNull(),
  slug: text('slug').notNull(),
  defaultBranch: text('default_branch'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ userSlugIdx: uniqueIndex('repos_user_key_slug_idx').on(t.userKey, t.slug) }));

export const scheduledPrompts = pgTable('scheduled_prompts', {
  id: uuid('id').primaryKey().defaultRandom(),
  cron: text('cron').notNull(),
  prompt: text('prompt').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdBy: text('created_by').notNull(),
  workerImage: text('worker_image'),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  mode: text('mode').notNull().default('interactive'),
  name: text('name'),
  prompt: text('prompt'),
  status: text('status').notNull().default('queued'),
  branch: text('branch'),
  prUrl: text('pr_url'),
  createdBy: text('created_by').notNull(),
  containerId: text('container_id'),
  workerTokenHash: text('worker_token_hash'),
  scheduledPromptId: uuid('scheduled_prompt_id').references(() => scheduledPrompts.id, { onDelete: 'set null' }),
  // Set when this task is a step of a workflow run; null for standalone sessions.
  workflowRunId: uuid('workflow_run_id').references(() => workflowRuns.id, { onDelete: 'set null' }),
  workflowStepKey: text('workflow_step_key'),
  iteration: integer('iteration'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  workerImage: text('worker_image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workflows = pgTable('workflows', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // Full WorkflowDefinition JSON the user authored (steps, trigger, maxIterations).
  definition: jsonb('definition').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workflowRuns = pgTable('workflow_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').notNull().references(() => workflows.id),
  status: text('status').notNull().default('queued'),
  branch: text('branch'),
  prUrl: text('pr_url'),
  currentStepKey: text('current_step_key'),
  iteration: integer('iteration').notNull().default(0),
  triggerContext: jsonb('trigger_context'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id),
  seq: bigint('seq', { mode: 'number' }).notNull(),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ taskSeqIdx: uniqueIndex('events_task_seq_idx').on(t.taskId, t.seq) }));

export const userEnvs = pgTable('user_envs', {
  id: uuid('id').primaryKey().defaultRandom(),
  // = displayName today; becomes a real user id once SSO lands. One blob per user.
  userKey: text('user_key').notNull().unique(),
  envEncrypted: text('env_encrypted').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const githubCredentials = pgTable('github_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  // = displayName today; becomes a real user id once SSO lands. One credential per user.
  userKey: text('user_key').notNull().unique(),
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
  // = displayName today; becomes a real user id once SSO lands. One layout per user.
  userKey: text('user_key').notNull().unique(),
  layout: jsonb('layout').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userSettings = pgTable('user_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userKey: text('user_key').notNull().unique(),
  defaultWorkerImage: text('default_worker_image'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const inboundMessages = pgTable('inbound_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id),
  body: text('body').notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
