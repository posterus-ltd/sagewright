import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { loadConfig } from '../config';
import { tasks, workflowRuns } from '../db/schema';
import { createEventBus } from '../events/event-bus';
import { createEventStore } from '../events/event-store';
import { createSessionService } from '../sessions/session-service';
import { fakeWorkerRegistry, makeTestApp } from '../test/make-test-app';
import type { SpawnInput } from '../tasks/worker-spawner';
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
  envBlob?: string;
  spawn?: (i: SpawnInput) => Promise<{ containerId: string }>;
}) => {
  const { db } = await makeTestApp();
  const service = createWorkflowService({ db: db as never });
  const wf = await service.create({ definition: opts.definitionOverride ?? definition, enabled: true }, 'al');

  const spawnInputs: SpawnInput[] = [];
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

  // One spawner shared by the step seam (sessionService) and the runner's ops
  // containers, so every container creation is captured in declared order.
  const spawner = {
    spawn: async (i: SpawnInput) => {
      spawnInputs.push(i);
      if (opts.spawn) return opts.spawn(i);
      return { containerId: `c-${spawnInputs.length}` };
    },
    retire: async () => undefined,
  };

  const volume = {
    slugFromUrl: (u: string) => u,
    cloneOrPull: async (r: { slug: string; url: string }) => ({ slug: r.slug, url: r.url, defaultBranch: 'main' }),
    reconcile: () => undefined,
    describe: () => ({ status: 'present', error: null }),
    addSessionWorktrees: async () => [],
    addRunWorktrees: async () => [{ slug: 'a-b', url: 'u', defaultBranch: 'main', path: '/v/a-b' }],
    removeSessionWorktrees: vi.fn(async () => undefined),
    removeRepo: async () => undefined,
  } as never;

  const eventStore = createEventStore(db as never);
  const eventBus = createEventBus();
  // Real session seam over the test db — this is what now provisions each step,
  // so steps inherit the full resolved user env (the {GITHUB_TOKEN}-only bug fix).
  const sessionService = createSessionService({
    db: db as never,
    eventStore,
    eventBus,
    spawner: spawner as never,
    volume,
    config,
    userEnvService: { get: async () => opts.envBlob ?? '' } as never,
    githubCredentialService: { resolve: async () => undefined } as never,
    userSettingsService: { getDefaultWorker: async () => null } as never,
    workerRegistry: fakeWorkerRegistry(),
  });

  const runner = createWorkflowRunner({
    db: db as never,
    spawner: spawner as never,
    sessionService,
    agentRunner: { execStep: async () => ({ exitCode: opts.stepExit ?? 0 }) },
    exec: {
      startAgent: async () => { throw new Error('unused'); },
      capture: async (_id, o) => {
        captures.push(o.cmd);
        return { exitCode: opts.commandsExit ?? 0, stdout: '', stderr: '' };
      },
    },
    volume,
    config,
    githubCredentialService: { resolve: async () => undefined } as never,
    files,
    logger: { error: () => undefined },
  });

  return { db, runner, workflowId: wf.id, spawnInputs, captures };
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

  it('passes the full resolved user env to each step, not just GITHUB_TOKEN', async () => {
    const { db, runner, workflowId, spawnInputs } = await setup({ verdicts: [true], envBlob: 'FOO=bar\n' });
    const run = await runner.start(workflowId, 'al');
    await waitForRun(db, run!.id);

    // Steps are now provisioned through the session seam, which merges the user's
    // stored .env — the old workflow-runner built step env as { GITHUB_TOKEN } only.
    expect(spawnInputs.some((i) => i.userEnv['FOO'] === 'bar')).toBe(true);
  });

  it('settles a step task to failed (not stuck provisioning) when its spawn throws', async () => {
    const { db, runner, workflowId } = await setup({
      verdicts: [true],
      spawn: async () => {
        throw new Error('docker daemon unreachable');
      },
    });
    const run = await runner.start(workflowId, 'al');
    const settled = await waitForRun(db, run!.id);

    expect(settled.status).toBe('failed');
    // The seam stamps the step task FAILED before rethrowing — previously it stayed
    // stuck at 'provisioning' because the duplicated spawn path had no failure handler.
    const rows = (await (db as never as { select: () => never })
      .select()
      .from(tasks)
      .where(eq(tasks.workflowRunId, run!.id))) as (typeof tasks.$inferSelect)[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('failed');
  });
});
