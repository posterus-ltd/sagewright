import { z } from 'zod';

import { TaskStatus } from './enums';
import { sessionModeSchema } from './terminal';

/** A configured repository. The UI edits these as a newline-separated URL list;
 *  `slug` and `defaultBranch` are derived server-side when the repo is cloned. */
export const repoSchema = z.object({
  id: z.string(),
  url: z.string().min(1),
  slug: z.string().min(1),
  defaultBranch: z.string().nullable(),
  createdAt: z.string(),
});
export type Repo = z.infer<typeof repoSchema>;

/** Reconcile state of a repo's main clone on the shared volume. */
export const repoStatusSchema = z.enum(['present', 'cloning', 'error']);
export type RepoStatus = z.infer<typeof repoStatusSchema>;

export const repoWithStatusSchema = repoSchema.extend({
  status: repoStatusSchema,
  error: z.string().nullable().default(null),
});
export type RepoWithStatus = z.infer<typeof repoWithStatusSchema>;

/** Save payload from the Settings textarea: one repo URL per line. */
export const saveReposSchema = z.object({
  urls: z.array(z.string().min(1)),
});
export type SaveReposInput = z.infer<typeof saveReposSchema>;

/** One repo's worktree handed to a worker via REPO_MANIFEST. */
export const repoManifestEntrySchema = z.object({
  slug: z.string(),
  url: z.string(),
  defaultBranch: z.string().nullable(),
  path: z.string(),
});
export type RepoManifestEntry = z.infer<typeof repoManifestEntrySchema>;

/** Starting a session takes no input; an optional prompt seeds the agent. */
export const createTaskSchema = z.object({
  prompt: z.string().min(1).optional(),
  workerImage: z.string().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const taskSchema = z.object({
  id: z.string(),
  mode: sessionModeSchema,
  name: z.string().nullable(),
  prompt: z.string().nullable(),
  workerImage: z.string().nullable(),
  status: z.nativeEnum(TaskStatus),
  branch: z.string().nullable(),
  prUrl: z.string().nullable(),
  createdBy: z.string(),
  containerId: z.string().nullable(),
  scheduledPromptId: z.string().nullable(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Task = z.infer<typeof taskSchema>;

/** Rename a session. A blank/whitespace name clears it back to the default label. */
export const updateTaskSchema = z.object({
  name: z.string().max(200).nullable(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/** The human label for a session: its custom name, else a prompt preview, else a generic fallback. */
export const taskLabel = (task: Pick<Task, 'name' | 'prompt'>, max = 60): string => {
  const name = task.name?.trim();
  if (name) return name;
  if (task.prompt) return task.prompt.slice(0, max);
  return 'Interactive session';
};

/** A cron-scheduled headless prompt; the agent picks which repo(s) to work in. */
export const scheduledPromptSchema = z.object({
  id: z.string(),
  cron: z.string().min(1),
  prompt: z.string().min(1),
  enabled: z.boolean(),
  // Pins which worker harness runs this task; null inherits the creator's default.
  workerImage: z.string().nullable(),
  lastRunAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ScheduledPrompt = z.infer<typeof scheduledPromptSchema>;

export const createScheduledPromptSchema = z.object({
  cron: z.string().min(1),
  prompt: z.string().min(1),
  enabled: z.boolean().default(true),
  workerImage: z.string().optional(),
});
export type CreateScheduledPromptInput = z.infer<typeof createScheduledPromptSchema>;

export const updateScheduledPromptSchema = createScheduledPromptSchema.partial();
export type UpdateScheduledPromptInput = z.infer<typeof updateScheduledPromptSchema>;
