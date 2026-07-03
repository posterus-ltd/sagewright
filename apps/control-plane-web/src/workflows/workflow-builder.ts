import { WorkflowStepKind, type WorkflowStep } from '@sagewright/shared';

// path is PropertyKey[] (not just string | number) to match zod's ZodIssue.path
// verbatim, so a schema's safeParse().error.issues can be passed in unmodified.
export interface WorkflowIssue {
  path: readonly PropertyKey[];
  message: string;
}

export const slugify = (name: string): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'step';
};

export const uniqueStepKey = (base: string, existingKeys: string[]): string => {
  const candidate = slugify(base);
  if (!existingKeys.includes(candidate)) return candidate;
  let n = 2;
  while (existingKeys.includes(`${candidate}-${n}`)) n++;
  return `${candidate}-${n}`;
};

// New steps are named for their kind, keyed once at creation time (renaming a
// step later must never silently break another step's onFailureGoTo target).
export const createStep = (
  kind: WorkflowStepKind,
  existingKeys: string[],
  defaultWorkerImage: string,
): WorkflowStep => {
  const name = kind === WorkflowStepKind.VALIDATION ? 'Validate' : 'New step';
  return {
    key: uniqueStepKey(name, existingKeys),
    name,
    goal: '',
    workerImage: defaultWorkerImage,
    kind,
    validateCommands: kind === WorkflowStepKind.VALIDATION ? [] : undefined,
  };
};

export const textToCommands = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

export const commandsToText = (commands: string[] | undefined): string =>
  (commands ?? []).join('\n');

const pathsEqual = (
  a: readonly PropertyKey[],
  b: readonly PropertyKey[],
): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

export const issueAt = (
  issues: WorkflowIssue[],
  path: readonly PropertyKey[],
): string | undefined => issues.find((i) => pathsEqual(i.path, path))?.message;

export const stepFieldIssues = (
  issues: WorkflowIssue[],
  index: number,
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const issue of issues) {
    if (issue.path[0] === 'steps' && issue.path[1] === index && issue.path.length > 2) {
      result[String(issue.path[2])] = issue.message;
    }
  }
  return result;
};

export const topLevelIssues = (issues: WorkflowIssue[]): string[] =>
  issues
    .filter((i) => i.path.length === 1 && i.path[0] === 'steps')
    .map((i) => i.message);
