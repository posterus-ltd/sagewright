import {
  SessionStatus,
  workflowDefinitionSchema,
  type UpdateWorkflowInput,
  type Workflow,
  type WorkflowInput,
  type WorkflowRun,
  type WorkflowRunDetail,
} from '@sagewright/shared';
import { and, asc, desc, eq } from 'drizzle-orm';

import type { Db } from '../db/client';
import { sessions, workflows } from '../db/schema';
import { rowToSession } from '../tasks/task-service';

interface WorkflowServiceDeps {
  db: Db;
}

const rowToWorkflow = (r: typeof workflows.$inferSelect): Workflow => ({
  id: r.id,
  name: r.name,
  definition: workflowDefinitionSchema.parse(r.definition),
  enabled: r.enabled,
  createdBy: r.createdBy,
  createdAt: r.createdAt.toISOString(),
});

// View a kind='workflow' parent session as a WorkflowRun.
const rowToRun = (r: typeof sessions.$inferSelect): WorkflowRun => ({
  id: r.id,
  workflowId: r.workflowId ?? '',
  status: r.status as SessionStatus,
  branch: r.branch,
  prUrl: r.prUrl,
  currentStepKey: r.currentStepKey,
  iteration: r.iteration ?? 0,
  error: r.error,
  createdBy: r.createdBy,
  createdAt: r.createdAt.toISOString(),
});

/**
 * CRUD for workflow definitions plus read access to runs and their step sessions.
 * The definition is validated with the shared zod schema on every write so a bad
 * JSON shape surfaces as a 400 (mirrors canvas-layout-service).
 */
export const createWorkflowService = (deps: WorkflowServiceDeps) => ({
  list: async (): Promise<Workflow[]> => {
    const rows = await deps.db.select().from(workflows).orderBy(desc(workflows.createdAt));
    return rows.map(rowToWorkflow);
  },

  get: async (id: string): Promise<Workflow | null> => {
    const [row] = await deps.db.select().from(workflows).where(eq(workflows.id, id)).limit(1);
    return row ? rowToWorkflow(row) : null;
  },

  create: async (input: WorkflowInput, createdBy: string): Promise<Workflow> => {
    const definition = workflowDefinitionSchema.parse(input.definition);
    const [row] = await deps.db
      .insert(workflows)
      .values({ name: definition.name, definition, enabled: input.enabled, createdBy })
      .returning();
    return rowToWorkflow(row);
  },

  update: async (id: string, input: UpdateWorkflowInput): Promise<Workflow | null> => {
    const set: Partial<typeof workflows.$inferInsert> = {};
    if (input.definition !== undefined) {
      const definition = workflowDefinitionSchema.parse(input.definition);
      set.definition = definition;
      set.name = definition.name;
    }
    if (input.enabled !== undefined) set.enabled = input.enabled;
    if (Object.keys(set).length === 0) return (await createWorkflowService(deps).get(id)) as Workflow | null;
    const [row] = await deps.db.update(workflows).set(set).where(eq(workflows.id, id)).returning();
    return row ? rowToWorkflow(row) : null;
  },

  // Drop the workflow and its run parent sessions; the parent_session_id cascade
  // removes each run's step sessions (and their events) too.
  remove: async (id: string): Promise<void> => {
    await deps.db.delete(sessions).where(eq(sessions.workflowId, id));
    await deps.db.delete(workflows).where(eq(workflows.id, id));
  },

  listRuns: async (workflowId?: string): Promise<WorkflowRun[]> => {
    const isRun = eq(sessions.kind, 'workflow');
    const where = workflowId ? and(isRun, eq(sessions.workflowId, workflowId)) : isRun;
    const rows = await deps.db.select().from(sessions).where(where).orderBy(desc(sessions.createdAt));
    return rows.map(rowToRun);
  },

  // A run (kind='workflow' session) joined with its definition and its step child
  // sessions (kind='workflow_step', oldest-first) — the shape the run graph renders from.
  getRunDetail: async (runId: string): Promise<WorkflowRunDetail | null> => {
    const [run] = await deps.db.select().from(sessions).where(eq(sessions.id, runId)).limit(1);
    if (!run || !run.workflowId) return null;
    const [workflow] = await deps.db.select().from(workflows).where(eq(workflows.id, run.workflowId)).limit(1);
    if (!workflow) return null;
    const stepRows = await deps.db
      .select()
      .from(sessions)
      .where(eq(sessions.parentSessionId, runId))
      .orderBy(asc(sessions.createdAt));
    return {
      ...rowToRun(run),
      definition: workflowDefinitionSchema.parse(workflow.definition),
      steps: stepRows.map(rowToSession),
    };
  },
});

export type WorkflowService = ReturnType<typeof createWorkflowService>;
