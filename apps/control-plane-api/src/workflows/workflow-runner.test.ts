import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { loadConfig } from '../config';
import { tasks, workflowRuns } from '../db/schema';
import { makeTestApp } from '../test/make-test-app';
import { createWorkflowService } from './workflow-service';
import { createWorkflowRunner, type RunFiles } from './workflow-runner';

const config = loadConfig({
  DATABASE_URL: 'postgres://x',
  APP_PASSWORD: 'pw',
  SESSION_SECRET: 'sec',
  SECRETS_KEY: '0123456789abcdef0123456789abcdef',
  WORKER_IMAGE: 'w',
  CONTROL_PLANE_URL: 'http://c',
});

const definition = {
  name: 'Impl',
  trigger: { type: 'manual' as const },
  maxIterations: 3,
  steps: [
    { key: 'plan', name: 'Plan', kind: 'work' as const, workerImage: 'w', goal: 'plan' },
    { key: 'implement', name: 'Implement', kind: 'work' as const, workerImage: 'w', goal: 'build' },
    { key: 'validate', name: 'Validate', kind: 'validation' as const, workerImage: 'w', goal: 'check', onFailureGoTo: 'implement' },
  ],
};

// Build a runner over the pg-mem db with fully faked containers/files. `verdicts`
// is the sequence of pass/fail the (faked) validation step emits, one per visit.
const setup = async (opts: {
  verdicts: boolean[];
  stepExit?: number;
  commandsExit?: number;
  definitionOverride?: typeof definition;
}) => {
  const { db } = await makeTestApp();
  const service = createWorkflowService({ db: db as never });
  const wf = await service.create({ definition: opts.definitionOverride ?? definition, enabled: true }, 'al');

  const spawns: string[] = [];
  const captures: string[][] = [];
  let verdictIdx = 0;

  const files: RunFiles = {
    ensureDir: async () => undefined,
    readText: async (path: string) => {
      if (path.endsWith('verdict.json')) {
        const passed = opts.verdicts[Math.min(verdictIdx++, opts.verdicts.length - 1)] ?? false;
        return JSON.stringify({ passed, summary: passed ? 'ok' : 'nope' });
      }
      if (path.endsWith('handoff.md')) return 'handoff';
      return null;
    },
  };

  const runner = createWorkflowRunner({
    db: db as never,
    spawner: {
      spawn: async (i) => {
        spawns.push(i.taskId);
        return { containerId: `c-${spawns.length}` };
      },
      retire: async () => undefined,
    },
    agentRunner: { execStep: async () => ({ exitCode: opts.stepExit ?? 0 }) },
    exec: {
      startAgent: async () => { throw new Error('unused'); },
      capture: async (_id, o) => {
        captures.push(o.cmd);
        return { exitCode: opts.commandsExit ?? 0, stdout: '', stderr: '' };
      },
    },
    volume: {
      slugFromUrl: (u: string) => u,
      cloneOrPull: async (r) => ({ slug: r.slug, url: r.url, defaultBranch: 'main' }),
      reconcile: () => undefined,
      describe: () => ({ status: 'present', error: null }),
      addSessionWorktrees: async () => [],
      addRunWorktrees: async () => [{ slug: 'a-b', url: 'u', defaultBranch: 'main', path: '/v/a-b' }],
      removeSessionWorktrees: vi.fn(async () => undefined),
      removeRepo: async () => undefined,
    } as never,
    config,
    userEnvService: { getValue: async () => undefined } as never,
    githubCredentialService: { resolve: async () => undefined } as never,
    files,
    logger: { error: () => undefined },
  });

  return { db, runner, workflowId: wf.id, spawns, captures };
};

// start() is fire-and-forget; poll the run row until it leaves 'running'.
const waitForRun = async (db: unknown, runId: string): Promise<typeof workflowRuns.$inferSelect> => {
  for (let i = 0; i < 200; i += 1) {
    const [row] = await (db as never as { select: () => never })
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId))
      .limit(1);
    const r = row as typeof workflowRuns.$inferSelect | undefined;
    if (r && r.status !== 'running') return r;
    await new Promise((res) => setTimeout(res, 5));
  }
  throw new Error('run did not settle');
};

const stepKeys = async (db: unknown, runId: string): Promise<string[]> => {
  const rows = await (db as never as { select: () => never })
    .select()
    .from(tasks)
    .where(eq(tasks.workflowRunId, runId));
  return (rows as (typeof tasks.$inferSelect)[]).map((r) => r.workflowStepKey!);
};

describe('workflow-runner', () => {
  it('runs plan→implement→validate and succeeds when validation passes', async () => {
    const { db, runner, workflowId } = await setup({ verdicts: [true] });
    const run = await runner.start(workflowId, 'al', 'feature requirements');
    const settled = await waitForRun(db, run!.id);

    expect(settled.status).toBe('succeeded');
    const keys = await stepKeys(db, run!.id);
    expect(keys).toEqual(['plan', 'implement', 'validate']);
    expect(settled.currentStepKey).toBeNull();
  });

  it('loops back to onFailureGoTo on failure, then succeeds', async () => {
    const { db, runner, workflowId } = await setup({ verdicts: [false, true] });
    const run = await runner.start(workflowId, 'al');
    const settled = await waitForRun(db, run!.id);

    expect(settled.status).toBe('succeeded');
    // plan, implement, validate(fail) → implement, validate(pass)
    const keys = await stepKeys(db, run!.id);
    expect(keys).toEqual(['plan', 'implement', 'validate', 'implement', 'validate']);
    expect(settled.iteration).toBe(1);
  });

  it('stops at max_iterations when validation never passes', async () => {
    const { db, runner, workflowId } = await setup({ verdicts: [false] });
    const run = await runner.start(workflowId, 'al');
    const settled = await waitForRun(db, run!.id);

    expect(settled.status).toBe('max_iterations');
    expect(settled.iteration).toBe(3);
    // plan + (implement,validate) ×3
    const keys = await stepKeys(db, run!.id);
    expect(keys.filter((k) => k === 'validate')).toHaveLength(3);
  });

  it('fails the run (no push) when a step exits non-zero', async () => {
    const { db, runner, workflowId, captures } = await setup({ verdicts: [true], stepExit: 1 });
    const run = await runner.start(workflowId, 'al');
    const settled = await waitForRun(db, run!.id);

    expect(settled.status).toBe('failed');
    // pushAndOpenPrs runs `git status` per repo; a failed run must not push.
    expect(captures.some((c) => c[0] === 'git')).toBe(false);
  });

  it('records the failure reason and keeps the failed step when a step exits non-zero', async () => {
    const { db, runner, workflowId } = await setup({ verdicts: [true], stepExit: 2 });
    const run = await runner.start(workflowId, 'al');
    const settled = await waitForRun(db, run!.id);

    expect(settled.status).toBe('failed');
    // The reason names the step and its exit code so the UI can show "what happened".
    expect(settled.error).toContain('plan');
    expect(settled.error).toContain('2');
    // The failed step stays on the run (not nulled) so the graph can highlight it.
    expect(settled.currentStepKey).toBe('plan');
  });

  it('records a reason and clears the step on a successful run', async () => {
    const { db, runner, workflowId } = await setup({ verdicts: [true] });
    const run = await runner.start(workflowId, 'al');
    const settled = await waitForRun(db, run!.id);

    expect(settled.status).toBe('succeeded');
    expect(settled.error).toBeNull();
    expect(settled.currentStepKey).toBeNull();
  });

  it('fails validation when objective commands fail even if the verdict passes', async () => {
    const def = {
      ...definition,
      maxIterations: 1,
      steps: [
        definition.steps[0]!,
        definition.steps[1]!,
        { ...definition.steps[2]!, validateCommands: ['exit 1'] },
      ],
    };
    const { db, runner, workflowId } = await setup({ verdicts: [true], commandsExit: 1, definitionOverride: def });
    const run = await runner.start(workflowId, 'al');
    const settled = await waitForRun(db, run!.id);

    expect(settled.status).toBe('max_iterations');
  });
});
