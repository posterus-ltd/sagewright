import { TaskStatus, type Task, type WorkflowDefinition } from '@sagewright/shared';
import type { Edge, Node } from '@xyflow/react';

export type StepNodeStatus = 'pending' | 'running' | 'done' | 'failed';

export interface StepNodeData {
  stepKey: string;
  name: string;
  kind: 'work' | 'validation';
  workerImage: string;
  status: StepNodeStatus;
  iteration: number | null;
  taskId: string | null;
  // xyflow requires node data to be an index-signature record.
  [key: string]: unknown;
}

export const NODE_W = 230;
export const NODE_H = 96;
const GAP_X = 90;

/** The most recent execution of a step: highest iteration, then newest createdAt. */
const latestTaskFor = (steps: Task[], key: string): Task | undefined =>
  steps
    .filter((t) => t.workflowStepKey === key)
    .sort((a, b) => (b.iteration ?? 0) - (a.iteration ?? 0) || b.createdAt.localeCompare(a.createdAt))[0];

const toStatus = (t: Task | undefined): StepNodeStatus => {
  if (!t) return 'pending';
  if (t.status === TaskStatus.DONE) return 'done';
  if (t.status === TaskStatus.FAILED || t.status === TaskStatus.STOPPED) return 'failed';
  return 'running';
};

/**
 * Turn a workflow definition + its step task rows into a GitHub-Actions-style graph:
 * one node per step laid out left-to-right, sequential edges between them, and a
 * dashed "on failure" edge from each validation step back to its loop target.
 */
export const buildWorkflowGraph = (
  def: WorkflowDefinition,
  taskRows: Task[],
): { nodes: Node<StepNodeData>[]; edges: Edge[] } => {
  const nodes: Node<StepNodeData>[] = def.steps.map((s, i) => {
    const task = latestTaskFor(taskRows, s.key);
    return {
      id: s.key,
      type: 'workflowStep',
      position: { x: i * (NODE_W + GAP_X), y: 0 },
      data: {
        stepKey: s.key,
        name: s.name,
        kind: s.kind,
        workerImage: s.workerImage,
        status: toStatus(task),
        iteration: task?.iteration ?? null,
        taskId: task?.id ?? null,
      },
    };
  });

  const edges: Edge[] = [];
  def.steps.forEach((s, i) => {
    const next = def.steps[i + 1];
    if (next) edges.push({ id: `${s.key}->${next.key}`, source: s.key, target: next.key });
    if (s.onFailureGoTo) {
      edges.push({
        id: `${s.key}~>${s.onFailureGoTo}`,
        source: s.key,
        target: s.onFailureGoTo,
        label: 'on failure',
        animated: true,
        style: { strokeDasharray: '4 4' },
      });
    }
  });

  return { nodes, edges };
};
