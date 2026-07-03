import { z } from 'zod';

import { SessionStatus } from './enums';
import { sessionSchema } from './session.schema';

/**
 * A workflow is a JSON-configurable sequence of steps a non-interactive run goes
 * through (visualised like a GitHub Actions graph). Each step names a GOAL and the
 * WORKER image that executes it — the image implicitly selects the harness/LLM. A
 * run drives the steps sequentially on one shared worktree, passing a handoff
 * forward, looping on validation failure until it passes or maxIterations is hit.
 */

/** A step either does work or validates prior work (the latter gates the loop). */
export enum WorkflowStepKind {
  WORK = 'work',
  VALIDATION = 'validation',
}

export const workflowStepSchema = z.object({
  /** Stable identifier referenced by onFailureGoTo and matched to step task rows. */
  key: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/i, 'key must be alphanumeric/hyphen'),
  name: z.string().min(1),
  /** What this step should accomplish — injected into the worker's prompt. */
  goal: z.string().min(1),
  /** Docker image of the harness that runs this step (implies the model). */
  workerImage: z.string().min(1),
  kind: z.enum(WorkflowStepKind),
  /** On validation failure, jump back to this step key for another iteration. */
  onFailureGoTo: z.string().min(1).optional(),
  /** Objective checks run in the worktree; all must exit 0 for the step to pass. */
  validateCommands: z.array(z.string().min(1)).optional(),
});
export type WorkflowStep = z.infer<typeof workflowStepSchema>;

export enum TriggerType {
  MANUAL = 'manual',
  CRON = 'cron',
}

/** What kicks off a run. Manual (a "Run" click) or cron (reuses the scheduler). */
export const workflowTriggerSchema = z
  .object({
    type: z.enum(TriggerType),
    cron: z.string().min(1).optional(),
  })
  .refine((t) => t.type !== 'cron' || !!t.cron, {
    message: 'a cron trigger requires a cron expression',
    path: ['cron'],
  });
export type WorkflowTrigger = z.infer<typeof workflowTriggerSchema>;

export const workflowDefinitionSchema = z
  .object({
    name: z.string().min(1),
    trigger: workflowTriggerSchema,
    maxIterations: z.number().int().min(1),
    steps: z.array(workflowStepSchema).min(1),
  })
  .superRefine((def, ctx) => {
    const keys = def.steps.map((s) => s.key);
    const dupes = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
    if (dupes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate step keys: ${dupes.join(', ')}`,
        path: ['steps'],
      });
    }
    def.steps.forEach((s, i) => {
      if (s.onFailureGoTo && !keys.includes(s.onFailureGoTo)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `onFailureGoTo "${s.onFailureGoTo}" is not a step key`,
          path: ['steps', i, 'onFailureGoTo'],
        });
      }
    });
    if (!def.steps.some((s) => s.kind === WorkflowStepKind.VALIDATION)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'a workflow needs at least one validation step',
        path: ['steps'],
      });
    }
  });
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;

/** Create/update payload — the JSON the user authors plus an enabled flag. */
export const workflowInputSchema = z.object({
  definition: workflowDefinitionSchema,
  enabled: z.boolean().default(true),
});
export type WorkflowInput = z.infer<typeof workflowInputSchema>;
export const updateWorkflowSchema = workflowInputSchema.partial();
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;

/** Manual trigger body: an optional seed (e.g. feature requirements) for step 1. */
export const runWorkflowSchema = z.object({
  input: z.string().optional(),
});
export type RunWorkflowInput = z.infer<typeof runWorkflowSchema>;

export const workflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  definition: workflowDefinitionSchema,
  enabled: z.boolean(),
  createdBy: z.string(),
  createdAt: z.string(),
});
export type Workflow = z.infer<typeof workflowSchema>;

/**
 * A workflow run is a VIEW over a `kind='workflow'` parent session: its status is the
 * parent's SessionStatus (a run that passed is `done`; one that shipped without passing
 * is `max_iterations`), and its steps are the parent's `kind='workflow_step'` children.
 */
export const workflowRunSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  status: z.enum(SessionStatus),
  branch: z.string().nullable(),
  prUrl: z.string().nullable(),
  currentStepKey: z.string().nullable(),
  iteration: z.number().int(),
  /** Failure reason when the run failed / hit max iterations; null otherwise. */
  error: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
});
export type WorkflowRun = z.infer<typeof workflowRunSchema>;

/** A run plus its definition and the step sessions (one per step execution). */
export const workflowRunDetailSchema = workflowRunSchema.extend({
  definition: workflowDefinitionSchema,
  steps: z.array(sessionSchema),
});
export type WorkflowRunDetail = z.infer<typeof workflowRunDetailSchema>;
