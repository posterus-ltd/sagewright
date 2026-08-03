import { Button, Stack } from '@mui/material';
import { WorkflowStepKind, type WorkflowStep } from '@sagewright/shared';
import type { FC } from 'react';

import { useRunners } from '../api/hooks';
import { createStep, stepFieldIssues, type WorkflowIssue } from './workflow-builder';
import { WorkflowStepCard } from './WorkflowStepCard';

interface WorkflowStepListProps {
  steps: WorkflowStep[];
  issues: WorkflowIssue[];
  onChange: (steps: WorkflowStep[]) => void;
}

export const WorkflowStepList: FC<WorkflowStepListProps> = ({
  steps,
  issues,
  onChange,
}) => {
  const { data } = useRunners();
  const runners = data?.runners ?? [];
  const defaultRunnerImage = data?.defaultImage ?? runners[0]?.image ?? '';

  const updateStep = (index: number, patch: Partial<WorkflowStep>): void => {
    onChange(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const kindPatch = (
    step: WorkflowStep,
    kind: WorkflowStepKind,
  ): Partial<WorkflowStep> =>
    kind === WorkflowStepKind.VALIDATION
      ? { kind, validateCommands: step.validateCommands ?? [] }
      : { kind, validateCommands: undefined, onFailureGoTo: undefined };

  const addStep = (kind: WorkflowStepKind): void => {
    onChange([
      ...steps,
      createStep(kind, steps.map((s) => s.key), defaultRunnerImage),
    ]);
  };

  // Clears any other step's loop-back target that pointed at the deleted step,
  // so removing a step never leaves the definition with a dangling reference.
  const deleteStep = (index: number, deletedKey: string): void => {
    onChange(
      steps
        .filter((_, i) => i !== index)
        .map((s) =>
          s.onFailureGoTo === deletedKey ? { ...s, onFailureGoTo: undefined } : s,
        ),
    );
  };

  return (
    <Stack spacing={2}>
      {steps.map((step, index) => (
        <WorkflowStepCard
          key={`${step.key}-${index}`}
          step={step}
          index={index}
          otherSteps={steps.filter((_, i) => i !== index)}
          runners={runners}
          fieldErrors={stepFieldIssues(issues, index)}
          onChange={(patch) => updateStep(index, patch)}
          onKindChange={(kind) => updateStep(index, kindPatch(step, kind))}
          onDelete={() => deleteStep(index, step.key)}
        />
      ))}
      <Stack direction="row" spacing={1}>
        <Button onClick={() => addStep(WorkflowStepKind.WORK)}>
          Add work step
        </Button>
        <Button onClick={() => addStep(WorkflowStepKind.VALIDATION)}>
          Add loop-back check
        </Button>
      </Stack>
    </Stack>
  );
};
