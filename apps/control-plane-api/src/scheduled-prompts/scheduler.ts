import { SessionKind, SessionMode, TERMINAL_STATUSES, TriggerType } from '@sagewright/shared';
import { Cron } from 'croner';
import { and, eq, notInArray } from 'drizzle-orm';

import type { Db } from '../db/client';
import { scheduledPrompts, sessions } from '../db/schema';
import type { TaskService } from '../tasks/task-service';
import type { WorkflowService } from '../workflows/workflow-service';
import type { WorkflowRunner } from '../workflows/workflow-runner';

// Minimal logging surface so the scheduler can run with the Fastify logger in prod
// and fall back to `console` in tests without pulling in a logger dependency.
interface SchedulerLogger {
  error: (err: unknown, msg?: string) => void;
}

/**
 * Cross-instance leadership so only ONE control-plane runs the crons (otherwise every
 * replica fires every prompt). Backed by pg_try_advisory_lock in prod; faked in tests.
 * pg-mem has no advisory locks, hence the injectable seam.
 */
export interface Leadership {
  /** True if this instance should own scheduling. */
  acquire: () => Promise<boolean>;
}

interface SchedulerDeps {
  db: Db;
  taskService: TaskService;
  // Optional so existing task-only tests construct the scheduler without workflows.
  workflowService?: WorkflowService;
  workflowRunner?: WorkflowRunner;
  logger?: SchedulerLogger;
  // Defaults to always-leader (single-instance dev) when not injected.
  leadership?: Leadership;
  // IANA timezone the cron expressions are evaluated in (e.g. 'America/New_York').
  timezone?: string;
}

export interface SchedulableRow {
  id: string;
  cron: string;
  prompt: string;
  enabled: boolean;
  createdBy: string;
  // Pins which worker harness runs the task; null inherits the creator's default.
  workerImage: string | null;
}

/**
 * Cron runner for scheduled prompts. Each enabled row maps to a Cron job that,
 * on fire, creates a headless task with the row's prompt — the agent then picks
 * which configured repo(s) to work in.
 */
export const createScheduler = (deps: SchedulerDeps) => {
  const jobs = new Map<string, Cron>();
  const tz = deps.timezone;
  const leadership: Leadership = deps.leadership ?? { acquire: async () => true };
  // Cron options shared by every job: skip overlapping runs of the same job and
  // evaluate the expression in the configured timezone.
  const cronOpts = (extra: Record<string, unknown> = {}): never =>
    ({ protect: true, ...(tz ? { timezone: tz } : {}), ...extra } as never);
  // Guards against a slow run overlapping its next tick across separate jobs/catch-up.
  const inFlight = new Set<string>();
  // Mutable so main.ts can inject the Fastify logger after the app is built (the
  // scheduler must be constructed before buildApp, which depends on it).
  let logger: SchedulerLogger = deps.logger ?? console;

  // DB-backed overlap guard. `inFlight` only spans provisioning — taskService.create
  // resolves once the agent has STARTED, not finished — and croner's `protect` sees a
  // fire-and-forget callback complete instantly, so neither covers a run that outlives
  // its cron interval. The sessions table does, and it survives restarts too.
  const hasActiveRun = async (where: ReturnType<typeof and>): Promise<boolean> => {
    const active = await deps.db.select({ id: sessions.id }).from(sessions).where(where).limit(1);
    return active.length > 0;
  };

  const fire = async (row: SchedulableRow): Promise<void> => {
    if (inFlight.has(row.id)) return; // a prior fire is still provisioning — skip this tick
    inFlight.add(row.id);
    let skipped = false;
    try {
      if (
        await hasActiveRun(
          and(eq(sessions.scheduledPromptId, row.id), notInArray(sessions.status, [...TERMINAL_STATUSES])),
        )
      ) {
        skipped = true; // the previous run is still working — don't pile a second onto it
        return;
      }
      // create() now persists a FAILED session even on bad input, but it still
      // re-throws — catch here so a failed run is logged, not silently dropped.
      await deps.taskService.create({ prompt: row.prompt, workerImage: row.workerImage ?? undefined }, row.createdBy, {
        mode: SessionMode.HEADLESS,
        scheduledPromptId: row.id,
      });
    } catch (err) {
      logger.error(err, `scheduled prompt ${row.id} failed to start`);
    } finally {
      // Stamp the attempt regardless of outcome so "last run" reflects reality —
      // but a skipped tick is not an attempt and must not shift the catch-up basis.
      if (!skipped) {
        await deps.db.update(scheduledPrompts).set({ lastRunAt: new Date() }).where(eq(scheduledPrompts.id, row.id));
      }
      inFlight.delete(row.id);
    }
  };

  const unregister = (id: string): void => {
    jobs.get(id)?.stop();
    jobs.delete(id);
  };

  const register = (row: SchedulableRow): void => {
    unregister(row.id);
    if (!row.enabled) return;
    try {
      jobs.set(row.id, new Cron(row.cron, cronOpts(), () => void fire(row)));
    } catch {
      // Invalid cron expression — skip. Writes are validated via isValidCron first.
    }
  };

  // Workflow cron triggers reuse the same croner machinery, namespaced under `wf:`
  // so their ids never collide with scheduled-prompt ids in the jobs map. On fire
  // they start a workflow run (the agent picks repos via the creator's config).
  const registerWorkflowCrons = async (): Promise<void> => {
    if (!deps.workflowService || !deps.workflowRunner) return;
    const runner = deps.workflowRunner;
    const workflows = await deps.workflowService.list();
    for (const wf of workflows) {
      if (!wf.enabled || wf.definition.trigger.type !== TriggerType.CRON || !wf.definition.trigger.cron) continue;
      try {
        jobs.set(
          `wf:${wf.id}`,
          new Cron(wf.definition.trigger.cron, cronOpts(), () => {
            void (async () => {
              // Same overlap rule as prompts: one active run per workflow. Each run
              // is expensive (containers + worktree + PR), so ticks never stack.
              if (
                await hasActiveRun(
                  and(
                    eq(sessions.workflowId, wf.id),
                    eq(sessions.kind, SessionKind.WORKFLOW),
                    notInArray(sessions.status, [...TERMINAL_STATUSES]),
                  ),
                )
              ) {
                return;
              }
              await runner.start(wf.id, wf.createdBy);
            })().catch((err) => logger.error(err, `workflow ${wf.id} cron failed`));
          }),
        );
      } catch {
        // Invalid cron — skip; the workflow save path validates before persisting.
      }
    }
  };

  // If the most recent scheduled time has already passed with no run since (we were
  // down), fire once now so a missed nightly job still happens after a restart.
  const catchUpIfMissed = (r: typeof scheduledPrompts.$inferSelect): void => {
    // A never-run prompt has no missed tick to catch up: measuring from epoch would
    // make every freshly-created prompt look overdue and fire it on the spot (e.g. a
    // "daily at 3am" added at noon would run at noon). Wait for its first real tick.
    if (!r.lastRunAt) return;
    try {
      // The first scheduled occurrence strictly after the last run. If that moment is
      // already in the past, a tick was missed while we were down — fire once now.
      const probe = new Cron(r.cron, cronOpts({ paused: true }));
      const nextAfterLast = probe.nextRun(r.lastRunAt);
      probe.stop();
      if (nextAfterLast && nextAfterLast.getTime() <= Date.now()) void fire(r);
    } catch {
      // Invalid cron — register() already skipped it.
    }
  };

  const syncAll = async (catchUp: boolean): Promise<void> => {
    for (const id of [...jobs.keys()]) unregister(id);
    // Only the leader runs crons; a non-leader replica stays idle (jobs cleared above).
    if (!(await leadership.acquire())) return;
    const rows = await deps.db.select().from(scheduledPrompts);
    for (const r of rows) {
      register(r);
      // Catch-up is a BOOT behaviour (we were down and missed a tick). A CRUD-driven
      // sync must not run it: this instance was up the whole time, and measuring from
      // a stale lastRunAt would e.g. fire a re-enabled nightly job the moment it's
      // re-enabled at noon.
      if (catchUp && r.enabled) catchUpIfMissed(r);
    }
    await registerWorkflowCrons();
  };

  return {
    start: () => syncAll(true),
    sync: () => syncAll(false),
    register,
    unregister,
    setLogger: (next: SchedulerLogger): void => {
      logger = next;
    },
    stopAll: () => {
      for (const id of [...jobs.keys()]) unregister(id);
    },
    isValidCron: (expr: string): boolean => {
      try {
        new Cron(expr, { paused: true });
        return true;
      } catch {
        return false;
      }
    },
  };
};

export type Scheduler = ReturnType<typeof createScheduler>;
