import { mkdir, readFile } from 'node:fs/promises';

import {
  EventType,
  runBranch,
  runDir,
  workflowDefinitionSchema,
  type RepoManifestEntry,
  type WorkflowDefinition,
  type WorkflowRun,
  type WorkflowRunStatus,
  type WorkflowStep,
} from '@sagewright/shared';
import { eq } from 'drizzle-orm';

import type { AppConfig } from '../config';
import type { Db } from '../db/client';
import { repos, workflowRuns, workflows } from '../db/schema';
import type { SessionService } from '../sessions/session-service';
import type { AgentRunner } from '../tasks/agent-runner';
import type { ContainerExec } from '../tasks/docker-client';
import { pushAndOpenPrs } from '../tasks/git-pr';
import type { SpawnInput } from '../tasks/worker-spawner';
import type { GithubCredentialService } from '../github/github-credential-service';
import type { Volume } from '../git/volume';

/** Injectable filesystem access so the handoff/verdict contract is testable. */
export interface RunFiles {
  /** Read a UTF-8 file; resolves null when it does not exist. */
  readText: (path: string) => Promise<string | null>;
  ensureDir: (path: string) => Promise<void>;
}

const defaultFiles: RunFiles = {
  readText: (path) => readFile(path, 'utf8').then((s) => s, () => null),
  ensureDir: (path) => mkdir(path, { recursive: true }).then(() => undefined),
};

interface WorkflowRunnerDeps {
  db: Db;
  spawner: { spawn: (i: SpawnInput) => Promise<{ containerId: string }>; retire: (id: string) => Promise<void> };
  sessionService: SessionService;
  agentRunner: Pick<AgentRunner, 'execStep'>;
  exec: ContainerExec;
  volume: Volume;
  config: AppConfig;
  githubCredentialService: GithubCredentialService;
  files?: RunFiles;
  logger?: { error: (err: unknown, msg?: string) => void };
}

interface Verdict {
  passed: boolean;
  summary?: string;
}

const HANDOFF_REL = '.sagewright/handoff.md';
const VERDICT_REL = '.sagewright/verdict.json';

/** Where validation/work commands run: a lone repo's worktree, else the run root. */
const opsCwd = (manifest: RepoManifestEntry[], dir: string): string =>
  manifest.length === 1 ? manifest[0]!.path : dir;

/**
 * Drives a workflow run: spawns each step as a headless step task on ONE shared
 * `workflow/<runId>` worktree, passes a handoff.md forward, and loops on validation
 * failure (objective commands AND an agent verdict must both pass) until it passes
 * or maxIterations is hit. On a terminal pass / max-iterations it pushes the shared
 * branch and opens a PR via a short-lived ops container. The whole drive is
 * fire-and-forget — `start` returns the created run immediately.
 */
export const createWorkflowRunner = (deps: WorkflowRunnerDeps) => {
  const files = deps.files ?? defaultFiles;
  const logger = deps.logger ?? console;

  const setRun = (runId: string, set: Partial<typeof workflowRuns.$inferInsert>): Promise<unknown> =>
    deps.db.update(workflowRuns).set(set).where(eq(workflowRuns.id, runId));

  // Compose the step prompt: goal + the prior handoff + the output contract the
  // orchestrator relies on. The worker's start-agent prepends SOUL.md to this.
  const buildPrompt = (step: WorkflowStep, dir: string, carried: string | null): string => {
    const handoffAbs = `${dir}/${HANDOFF_REL}`;
    const verdictAbs = `${dir}/${VERDICT_REL}`;
    const carry = carried?.trim()
      ? `## Handoff from previous step\n${carried}`
      : '## Handoff from previous step\nnone — you are the first step.';
    const verdictLine =
      step.kind === 'validation'
        ? `\nAlso write ${verdictAbs} as JSON: {"passed": boolean, "summary": string}. Set passed=false if anything is wrong.`
        : '';
    return [
      step.goal,
      '',
      carry,
      '',
      '## Required output',
      `Before exiting, OVERWRITE the file ${handoffAbs} with a concise handoff for the next step.${verdictLine}`,
    ].join('\n');
  };

  // Spawn one step as a workflow_step session through the single seam. The step
  // reuses the run's ONE shared worktree (passed in) so code carries over step to
  // step, and inherits the full resolved user env + image validation + FAILED-on-throw
  // contract the seam owns (a spawn throw now settles the step task FAILED, not stuck
  // provisioning, and bubbles up to fail the run).
  const spawnStepTask = async (
    runId: string,
    createdBy: string,
    step: WorkflowStep,
    iteration: number,
    prompt: string,
    manifest: RepoManifestEntry[],
  ): Promise<{ taskId: string; containerId: string }> => {
    const { id, containerId } = await deps.sessionService.spawnSession({
      kind: 'workflow_step',
      createdBy,
      prompt,
      workerImage: step.workerImage,
      parentSessionId: runId,
      workflowStepKey: step.key,
      iteration,
      branch: runBranch(runId),
      worktrees: { sessionDir: runDir(runId), manifest },
    });
    return { taskId: id, containerId };
  };

  const readVerdict = async (dir: string): Promise<Verdict> => {
    const raw = await files.readText(`${dir}/${VERDICT_REL}`);
    if (!raw) return { passed: false, summary: 'no verdict produced' };
    try {
      const parsed = JSON.parse(raw) as Verdict;
      return { passed: parsed.passed === true, summary: parsed.summary };
    } catch {
      return { passed: false, summary: 'verdict.json was not valid JSON' };
    }
  };

  const runValidateCommands = async (
    containerId: string,
    commands: string[] | undefined,
    cwd: string,
  ): Promise<boolean> => {
    for (const command of commands ?? []) {
      const res = await deps.exec.capture(containerId, { cmd: ['bash', '-lc', command], workingDir: cwd });
      if (res.exitCode !== 0) return false;
    }
    return true;
  };

  const drive = async (
    runId: string,
    def: WorkflowDefinition,
    createdBy: string,
    input: string | undefined,
  ): Promise<void> => {
    const stepsByKey = new Map(def.steps.map((s) => [s.key, s]));
    const dir = runDir(runId);
    let opsContainerId: string | null = null;
    let status: WorkflowRunStatus = 'failed';
    // Why a non-success run ended, and on which step — persisted so the run UI can
    // explain the failure instead of leaving it buried in the server log.
    let reason: string | null = null;
    let failedStepKey: string | null = null;
    let currentKey = def.steps[0]!.key;
    // True once the step loop is entered — lets the catch tell an in-step crash
    // (attribute to currentKey) from a setup-phase crash (no step ran yet).
    let inLoop = false;

    try {
      // Resolve the creator's repos + GitHub auth, then lay down one shared worktree.
      const credential = await deps.githubCredentialService.resolve(createdBy);
      const userEnv: Record<string, string> = {};
      if (credential) userEnv.GITHUB_TOKEN = credential.token;
      const configured = await deps.db.select().from(repos).where(eq(repos.userKey, createdBy));
      const manifest = await deps.volume.addRunWorktrees(
        runId,
        configured.map((r) => ({ url: r.url, slug: r.slug })),
        credential?.token,
      );
      await files.ensureDir(`${dir}/.sagewright`);

      let iteration = 0;
      let carried: string | null = input ?? null;
      inLoop = true;

      // Sequential step loop — never parallel: all steps share one worktree.
      for (;;) {
        const step = stepsByKey.get(currentKey);
        if (!step) {
          status = 'failed';
          reason = `unknown step "${currentKey}" referenced in the workflow`;
          failedStepKey = currentKey;
          break;
        }
        await setRun(runId, { currentStepKey: currentKey, iteration });

        const prompt = buildPrompt(step, dir, carried);
        const { taskId, containerId } = await spawnStepTask(runId, createdBy, step, iteration, prompt, manifest);
        const { exitCode } = await deps.agentRunner.execStep({
          taskId,
          containerId,
          manifest,
          sessionDir: dir,
          githubIdentity: credential,
        });
        if (exitCode !== 0) {
          status = 'failed';
          reason = `step "${step.name}" (${currentKey}) exited with code ${exitCode}`;
          failedStepKey = currentKey;
          break;
        }

        carried = (await files.readText(`${dir}/${HANDOFF_REL}`)) ?? carried;

        if (step.kind === 'validation') {
          if (!opsContainerId) {
            ({ containerId: opsContainerId } = await deps.spawner.spawn({
              taskId: `${runId}-ops`,
              mode: 'headless',
              manifest,
              sessionDir: dir,
              userEnv,
              workerImage: deps.config.workerImage,
            }));
          }
          const commandsOk = await runValidateCommands(opsContainerId, step.validateCommands, opsCwd(manifest, dir));
          const verdict = await readVerdict(dir);
          if (verdict.passed && commandsOk) {
            status = 'succeeded';
            break;
          }
          iteration += 1;
          await setRun(runId, { iteration });
          if (iteration >= def.maxIterations) {
            status = 'max_iterations';
            reason = `validation "${step.name}" did not pass after ${def.maxIterations} iterations${
              verdict.summary ? `: ${verdict.summary}` : ''
            }${commandsOk ? '' : ' (objective commands failed)'}`;
            failedStepKey = currentKey;
            break;
          }
          currentKey = step.onFailureGoTo ?? def.steps[0]!.key;
          continue;
        }

        // Work step → advance in declared order; falling off the end ends the run.
        const idx = def.steps.findIndex((s) => s.key === currentKey);
        const next = def.steps[idx + 1];
        if (!next) {
          status = 'succeeded';
          break;
        }
        currentKey = next.key;
      }

      // A pass or an exhausted loop both ship the work; a hard step failure does not.
      if (status === 'succeeded' || status === 'max_iterations') {
        if (!opsContainerId) {
          ({ containerId: opsContainerId } = await deps.spawner.spawn({
            taskId: `${runId}-ops`,
            mode: 'headless',
            manifest,
            sessionDir: dir,
            userEnv,
            workerImage: deps.config.workerImage,
          }));
        }
        await pushAndOpenPrs({
          exec: deps.exec,
          containerId: opsContainerId,
          taskId: runId,
          manifest,
          identity: credential,
          branch: runBranch(runId),
          emit: async (events) => {
            for (const e of events) {
              if (e.type === EventType.PR_OPENED && typeof e.payload['url'] === 'string') {
                await setRun(runId, { prUrl: e.payload['url'] as string });
              }
            }
          },
        });
      }
    } catch (err) {
      status = 'failed';
      reason = err instanceof Error ? err.message : String(err);
      failedStepKey = inLoop ? currentKey : null;
      logger.error(err, `workflow run ${runId} failed`);
    } finally {
      if (opsContainerId) await deps.spawner.retire(opsContainerId).catch(() => undefined);
      await deps.volume.removeSessionWorktrees(runId).catch(() => undefined);
      // Keep the failed step on the run so the graph can highlight where it died;
      // clear it for runs that reached an end state (succeeded / max_iterations).
      await setRun(runId, { status, error: reason, currentStepKey: status === 'failed' ? failedStepKey : null });
    }
  };

  return {
    /** Create a run row and kick off its drive loop (fire-and-forget). */
    start: async (workflowId: string, createdBy: string, input?: string): Promise<WorkflowRun | null> => {
      const [wf] = await deps.db.select().from(workflows).where(eq(workflows.id, workflowId)).limit(1);
      if (!wf) return null;
      const def = workflowDefinitionSchema.parse(wf.definition);

      const [run] = await deps.db
        .insert(workflowRuns)
        .values({
          workflowId,
          status: 'running',
          currentStepKey: def.steps[0]!.key,
          iteration: 0,
          triggerContext: input ? { input } : null,
          createdBy,
        })
        .returning();
      await setRun(run!.id, { branch: runBranch(run!.id) });

      void drive(run!.id, def, createdBy, input).catch(async (err) => {
        logger.error(err, `workflow run ${run!.id} crashed`);
        const error = err instanceof Error ? err.message : String(err);
        await setRun(run!.id, { status: 'failed', error, currentStepKey: null }).catch(() => undefined);
      });

      return {
        id: run!.id,
        workflowId,
        status: 'running',
        branch: runBranch(run!.id),
        prUrl: null,
        currentStepKey: def.steps[0]!.key,
        iteration: 0,
        error: null,
        createdBy,
        createdAt: run!.createdAt.toISOString(),
      };
    },
  };
};

export type WorkflowRunner = ReturnType<typeof createWorkflowRunner>;
