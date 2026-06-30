import { SessionStatus, type Session, type WorkflowDefinition } from '@sagewright/shared';
import { describe, expect, it } from 'vitest';

import { buildWorkflowGraph } from './workflow-graph';

const def: WorkflowDefinition = {
  name: 'Impl',
  trigger: { type: 'manual' },
  maxIterations: 3,
  steps: [
    { key: 'plan', name: 'Plan', kind: 'work', workerImage: 'w', goal: 'g' },
    { key: 'implement', name: 'Implement', kind: 'work', workerImage: 'w', goal: 'g' },
    { key: 'validate', name: 'Validate', kind: 'validation', workerImage: 'w', goal: 'g', onFailureGoTo: 'implement' },
  ],
};

const task = (over: Partial<Session>): Session => ({
  id: 't',
  kind: 'headless',
  name: null,
  prompt: null,
  workerImage: 'w',
  status: SessionStatus.DONE,
  branch: null,
  prUrl: null,
  createdBy: 'al',
  containerId: null,
  scheduledPromptId: null,
  parentSessionId: 'r1',
  workflowStepKey: null,
  iteration: 0,
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('buildWorkflowGraph', () => {
  it('creates a node per step with sequential + loop-back edges', () => {
    const { nodes, edges } = buildWorkflowGraph(def, []);
    expect(nodes.map((n) => n.id)).toEqual(['plan', 'implement', 'validate']);
    expect(nodes.every((n) => n.data.status === 'pending')).toBe(true);
    expect(edges.find((e) => e.id === 'plan->implement')).toBeTruthy();
    expect(edges.find((e) => e.id === 'implement->validate')).toBeTruthy();
    // loop-back edge from validation to its onFailureGoTo target
    const loop = edges.find((e) => e.source === 'validate' && e.target === 'implement');
    expect(loop?.animated).toBe(true);
  });

  it('reflects the latest task status per step and picks the highest iteration', () => {
    const tasks = [
      task({ id: 'p', workflowStepKey: 'plan', status: SessionStatus.DONE }),
      task({ id: 'i0', workflowStepKey: 'implement', iteration: 0, status: SessionStatus.DONE }),
      task({ id: 'i1', workflowStepKey: 'implement', iteration: 1, status: SessionStatus.RUNNING }),
    ];
    const { nodes } = buildWorkflowGraph(def, tasks);
    const implement = nodes.find((n) => n.id === 'implement')!;
    expect(implement.data.status).toBe('running');
    expect(implement.data.taskId).toBe('i1');
    expect(implement.data.iteration).toBe(1);
    expect(nodes.find((n) => n.id === 'validate')!.data.status).toBe('pending');
  });

  it('maps failed/stopped task statuses to a failed node', () => {
    const { nodes } = buildWorkflowGraph(def, [task({ workflowStepKey: 'plan', status: SessionStatus.FAILED })]);
    expect(nodes.find((n) => n.id === 'plan')!.data.status).toBe('failed');
  });
});
