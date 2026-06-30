import { Cron } from 'croner';
import { eq } from 'drizzle-orm';

import type { Db } from '../db/client';
import { scheduledPrompts } from '../db/schema';
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

  const fire = async (row: SchedulableRow): Promise<void> => {
    if (inFlight.has(row.id)) return; // a prior run is still going — skip this tick
    inFlight.add(row.id);
    try {
      // create() now persists a FAILED session even on bad input, but it still
      // re-throws — catch here so a failed run is logged, not silently dropped.
      await deps.taskService.create({ prompt: row.prompt, workerImage: row.workerImage ?? undefined }, row.createdBy, {
        mode: 'headless',
        scheduledPromptId: row.id,
      });
    } catch (err) {
      logger.error(err, `scheduled prompt ${row.id} failed to start`);
    } finally {
      // Stamp the attempt regardless of outcome so "last run" reflects reality.
      await deps.db.update(scheduledPrompts).set({ lastRunAt: new Date() }).where(eq(scheduledPrompts.id, row.id));
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
      if (!wf.enabled || wf.definition.trigger.type !== 'cron' || !wf.definition.trigger.cron) continue;
      try {
        jobs.set(
          `wf:${wf.id}`,
          new Cron(wf.definition.trigger.cron, cronOpts(), () => {
            void runner.start(wf.id, wf.createdBy).catch((err) => logger.error(err, `workflow ${wf.id} cron failed`));
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
    try {
      // The first scheduled occurrence strictly after the last run (epoch if never
      // run). If that moment is already in the past, a tick was missed while down.
      const probe = new Cron(r.cron, cronOpts({ paused: true }));
      const nextAfterLast = probe.nextRun(r.lastRunAt ?? new Date(0));
      probe.stop();
      if (nextAfterLast && nextAfterLast.getTime() <= Date.now()) void fire(r);
    } catch {
      // Invalid cron — register() already skipped it.
    }
  };

  const syncAll = async (): Promise<void> => {
    for (const id of [...jobs.keys()]) unregister(id);
    // Only the leader runs crons; a non-leader replica stays idle (jobs cleared above).
    if (!(await leadership.acquire())) return;
    const rows = await deps.db.select().from(scheduledPrompts);
    for (const r of rows) {
      register(r);
      if (r.enabled) catchUpIfMissed(r);
    }
    await registerWorkflowCrons();
  };

  return {
    start: syncAll,
    sync: syncAll,
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
