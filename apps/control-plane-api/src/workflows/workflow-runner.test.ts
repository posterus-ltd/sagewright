import { SessionStatus, TriggerType, WorkflowStepKind } from '@sagewright/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { loadConfig } from '../config';
import { sessions } from '../db/schema';
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
  trigger: { type: TriggerType.MANUAL },
  maxIterations: 3,
  steps: [
    { key: 'plan', name: 'Plan', kind: WorkflowStepKind.WORK, workerImage: 'w', goal: 'plan' },
    { key: 'implement', name: 'Implement', kind: WorkflowStepKind.WORK, workerImage: 'w', goal: 'build' },
    { key: 'validate', name: 'Validate', kind: WorkflowStepKind.VALIDATION, workerImage: 'w', goal: 'check', onFailureGoTo: 'implement' },
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
  addRunWorktrees?: () => Promise<{ slug: string; url: string; defaultBranch: string; path: string }[]>;
  execStep?: (i: { taskId: string }) => Promise<{ exitCode: number | null }>;
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

  const removeSessionWorktrees = vi.fn(async () => undefined);
  const volume = {
    slugFromUrl: (u: string) => u,
    cloneOrPull: async (r: { slug: string; url: string }) => ({ slug: r.slug, url: r.url, defaultBranch: 'main' }),
    reconcile: () => undefined,
    describe: () => ({ status: 'present', error: null }),
    addSessionWorktrees: async () => [],
    addRunWorktrees:
      opts.addRunWorktrees ?? (async () => [{ slug: 'a-b', url: 'u', defaultBranch: 'main', path: '/v/a-b' }]),
    listSessionWorktrees: async () => [],
    removeSessionWorktrees,
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
    agentRunner: { execStep: opts.execStep ?? (async () => ({ exitCode: opts.stepExit ?? 0 })) },
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

  return { db, runner, workflowId: wf.id, spawnInputs, captures, removeSessionWorktrees };
};

type TestDb = Awaited<ReturnType<typeof makeTestApp>>['db'];

// start() is fire-and-forget; poll the run's parent session until it leaves 'running'.
const waitForRun = async (db: TestDb, runId: string): Promise<typeof sessions.$inferSelect> => {
  for (let i = 0; i < 200; i += 1) {
    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, runId))
      .limit(1);
    const r = row as typeof sessions.$inferSelect | undefined;
    if (r && r.status !== 'running') return r;
    await new Promise((res) => setTimeout(res, 5));
  }
  throw new Error('run did not settle');
};

const stepKeys = async (db: TestDb, runId: string): Promise<string[]> => {
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.parentSessionId, runId));
  return (rows as (typeof sessions.$inferSelect)[]).map((r) => r.workflowStepKey!);
};

describe('workflow-runner', () => {
  it('runs plan→implement→validate and succeeds when validation passes', async () => {
    const { db, runner, workflowId } = await setup({ verdicts: [true] });
    const run = await runner.start(workflowId, 'al', 'feature requirements');
    const settled = await waitForRun(db, run!.id);

    expect(settled.status).toBe('done');
    const keys = await stepKeys(db, run!.id);
    expect(keys).toEqual(['plan', 'implement', 'validate']);
    expect(settled.currentStepKey).toBeNull();
    // A run records its own lifecycle: started when the drive began, ended on settle.
    expect(settled.startedAt).not.toBeNull();
    expect(settled.endedAt).not.toBeNull();
  });

  it('loops back to onFailureGoTo on failure, then succeeds', async () => {
    const { db, runner, workflowId } = await setup({ verdicts: [false, true] });
    const run = await runner.start(workflowId, 'al');
    const settled = await waitForRun(db, run!.id);

    expect(settled.status).toBe('done');
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

    expect(settled.status).toBe('done');
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
    const rows = (await db
      .select()
      .from(sessions)
      .where(eq(sessions.parentSessionId, run!.id))) as (typeof sessions.$inferSelect)[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('failed');
  });

  it('halts a stopped run at the next step boundary without shipping or overwriting STOPPED', async () => {
    // The user stops the run (POST /stop) while its first step is executing.
    let dbRef: unknown = null;
    const { db, runner, workflowId, captures, removeSessionWorktrees } = await setup({
      verdicts: [true],
      execStep: async ({ taskId }) => {
        const d = dbRef as TestDb;
        const [step] = await d
          .select()
          .from(sessions)
          .where(eq(sessions.id, taskId));
        await d
          .update(sessions)
          .set({ status: SessionStatus.STOPPED })
          .where(eq(sessions.id, step!.parentSessionId!));
        return { exitCode: 0 };
      },
    });
    dbRef = db;

    const run = await runner.start(workflowId, 'al');
    const settled = await waitForRun(db, run!.id);
    // The drive loop owns cleanup after a stop — wait for its sweep before asserting.
    const deadline = Date.now() + 2000;
    while (removeSessionWorktrees.mock.calls.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5));
    }

    expect(settled.status).toBe('stopped'); // the finally must not overwrite it
    expect(await stepKeys(db, run!.id)).toEqual(['plan']); // no step after the stop
    expect(captures.some((c) => c[0] === 'git')).toBe(false); // a cancelled run never ships
    expect(removeSessionWorktrees).toHaveBeenCalledWith(run!.id);
  });

  it('does not sweep the run worktree when setup fails before any step ran', async () => {
    // A transient failure while laying down worktrees (e.g. git fetch on a reconciled
    // resume) must not destroy the run's preserved uncommitted work.
    const { db, runner, workflowId, removeSessionWorktrees } = await setup({
      verdicts: [true],
      addRunWorktrees: async () => {
        throw new Error('git fetch failed');
      },
    });
    const run = await runner.start(workflowId, 'al');
    const settled = await waitForRun(db, run!.id);

    expect(settled.status).toBe('failed');
    expect(settled.error).toContain('git fetch failed');
    expect(removeSessionWorktrees).not.toHaveBeenCalled();
  });

  it('sweeps the run worktree once the run settles inside the loop', async () => {
    const { db, runner, workflowId, removeSessionWorktrees } = await setup({ verdicts: [true] });
    const run = await runner.start(workflowId, 'al');
    await waitForRun(db, run!.id);

    expect(removeSessionWorktrees).toHaveBeenCalledWith(run!.id);
  });

  it('resume seeds the prior on-disk handoff and restores the persisted iteration', async () => {
    const { db, runner, workflowId, spawnInputs } = await setup({ verdicts: [false] });
    // Simulate a run reconciled mid-flight: persisted at the validate step on iteration 2
    // (one short of maxIterations=3), carrying its original seed input on the row.
    const [parent] = await db
      .insert(sessions)
      .values({
        kind: 'workflow',
        createdBy: 'al',
        status: 'running',
        workflowId,
        currentStepKey: 'validate',
        iteration: 2,
        triggerContext: { input: 'ORIGINAL_SEED' },
      })
      .returning();
    const parentId = parent!.id;

    await runner.resume(parentId);
    const settled = await waitForRun(db, parentId);

    // Iteration was restored to 2, so a single failing validate hits maxIterations(3)
    // at once — NOT three fresh visits as a silent reset-to-0 would produce.
    expect(settled.status).toBe('max_iterations');
    const validateVisits = (await stepKeys(db, parentId)).filter((k) => k === 'validate');
    expect(validateVisits).toHaveLength(1);
    // The resumed step's prompt carries the previous step's on-disk handoff, not the
    // original seed input (which buildPrompt would otherwise mislabel as the handoff).
    expect(spawnInputs[0]!.prompt).toContain('handoff');
    expect(spawnInputs[0]!.prompt).not.toContain('ORIGINAL_SEED');
  });
});
