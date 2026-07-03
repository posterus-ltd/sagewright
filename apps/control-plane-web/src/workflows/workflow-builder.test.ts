import { WorkflowStepKind } from '@sagewright/shared';
import { describe, expect, it } from 'vitest';

import {
  commandsToText,
  createStep,
  issueAt,
  slugify,
  stepFieldIssues,
  textToCommands,
  topLevelIssues,
  uniqueStepKey,
  type WorkflowIssue,
} from './workflow-builder';

describe('slugify', () => {
  it('kebab-cases a name', () => {
    expect(slugify('Run Tests')).toBe('run-tests');
  });

  it('collapses runs of non-alphanumeric characters into a single hyphen', () => {
    expect(slugify('Plan (BDD+SDD)!!')).toBe('plan-bdd-sdd');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('--Step One--')).toBe('step-one');
  });

  it('falls back to "step" for symbol-only or empty input', () => {
    expect(slugify('!!!')).toBe('step');
    expect(slugify('')).toBe('step');
  });
});

describe('uniqueStepKey', () => {
  it('returns the slug when it does not collide', () => {
    expect(uniqueStepKey('Implement', ['plan'])).toBe('implement');
  });

  it('dedupes by appending -2, -3, ... on collision', () => {
    expect(uniqueStepKey('Step', ['step'])).toBe('step-2');
    expect(uniqueStepKey('Step', ['step', 'step-2'])).toBe('step-3');
  });
});

describe('createStep', () => {
  it('creates a work step with a unique key and blank goal', () => {
    const step = createStep(WorkflowStepKind.WORK, ['plan'], 'img:latest');
    expect(step.kind).toBe('work');
    expect(step.key).not.toBe('plan');
    expect(step.goal).toBe('');
    expect(step.workerImage).toBe('img:latest');
    expect(step.validateCommands).toBeUndefined();
    expect(step.onFailureGoTo).toBeUndefined();
  });

  it('creates a validation step with an empty validateCommands scaffold', () => {
    const step = createStep(WorkflowStepKind.VALIDATION, [], 'img:latest');
    expect(step.kind).toBe('validation');
    expect(step.validateCommands).toEqual([]);
  });

  it('never collides with existing keys', () => {
    const first = createStep(WorkflowStepKind.WORK, [], 'img');
    const second = createStep(WorkflowStepKind.WORK, [first.key], 'img');
    expect(second.key).not.toBe(first.key);
  });
});

describe('textToCommands / commandsToText', () => {
  it('splits multiline text into trimmed, non-empty commands', () => {
    expect(textToCommands('npm test\n  npm run lint  \n\n')).toEqual([
      'npm test',
      'npm run lint',
    ]);
  });

  it('round-trips commands back to newline-joined text', () => {
    expect(commandsToText(['npm test', 'npm run lint'])).toBe(
      'npm test\nnpm run lint',
    );
  });

  it('treats undefined commands as empty text', () => {
    expect(commandsToText(undefined)).toBe('');
  });
});

describe('issueAt / stepFieldIssues / topLevelIssues', () => {
  const issues: WorkflowIssue[] = [
    { path: ['steps'], message: 'duplicate step keys: a' },
    { path: ['steps', 1, 'onFailureGoTo'], message: 'not a step key' },
    { path: ['name'], message: 'Required' },
  ];

  it('issueAt finds a message at an exact path', () => {
    expect(issueAt(issues, ['name'])).toBe('Required');
    expect(issueAt(issues, ['steps', 1, 'onFailureGoTo'])).toBe(
      'not a step key',
    );
    expect(issueAt(issues, ['maxIterations'])).toBeUndefined();
  });

  it('stepFieldIssues scopes field messages to one step index', () => {
    expect(stepFieldIssues(issues, 1)).toEqual({
      onFailureGoTo: 'not a step key',
    });
    expect(stepFieldIssues(issues, 0)).toEqual({});
  });

  it('topLevelIssues returns only array-level "steps" messages', () => {
    expect(topLevelIssues(issues)).toEqual(['duplicate step keys: a']);
  });
});
