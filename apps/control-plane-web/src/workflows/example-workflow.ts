import { TriggerType, WorkflowStepKind, type WorkflowDefinition } from '@sagewright/shared';

/**
 * The canonical "implementation" workflow used as the editor's starting point:
 * plan (BDD+SDD) → implement → validate, looping back to implement on failure.
 * Runner images are placeholders — swap them for images from your Settings.
 */
export const EXAMPLE_WORKFLOW: WorkflowDefinition = {
  name: 'Implementation',
  trigger: { type: TriggerType.MANUAL },
  maxIterations: 3,
  steps: [
    {
      key: 'plan',
      name: 'Plan (BDD+SDD)',
      kind: WorkflowStepKind.WORK,
      runnerImage: 'sagewright-runner-claude-code:latest',
      goal: 'Produce a BDD/SDD implementation plan from the feature requirements.',
    },
    {
      key: 'implement',
      name: 'Implement',
      kind: WorkflowStepKind.WORK,
      runnerImage: 'sagewright-runner-opencode:latest',
      goal: 'Implement the plan described in the handoff.',
    },
    {
      key: 'validate',
      name: 'Validate',
      kind: WorkflowStepKind.VALIDATION,
      runnerImage: 'sagewright-runner-opencode:latest',
      goal: 'Validate the implementation against the plan and report a verdict.',
      validateCommands: ['nx affected -t test lint build'],
      onFailureGoTo: 'implement',
    },
  ],
};

export const EXAMPLE_WORKFLOW_JSON = JSON.stringify(EXAMPLE_WORKFLOW, null, 2);
