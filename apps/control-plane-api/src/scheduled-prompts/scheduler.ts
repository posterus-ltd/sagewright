import { Cron } from 'croner';
import { eq } from 'drizzle-orm';

import type { Db } from '../db/client';
import { scheduledPrompts } from '../db/schema';
import type { TaskService } from '../tasks/task-service';

// Minimal logging surface so the scheduler can run with the Fastify logger in prod
// and fall back to `console` in tests without pulling in a logger dependency.
interface SchedulerLogger {
  error: (err: unknown, msg?: string) => void;
}

interface SchedulerDeps {
  db: Db;
  taskService: TaskService;
  logger?: SchedulerLogger;
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
  // Mutable so main.ts can inject the Fastify logger after the app is built (the
  // scheduler must be constructed before buildApp, which depends on it).
  let logger: SchedulerLogger = deps.logger ?? console;

  const fire = async (row: SchedulableRow): Promise<void> => {
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
      jobs.set(row.id, new Cron(row.cron, () => void fire(row)));
    } catch {
      // Invalid cron expression — skip. Writes are validated via isValidCron first.
    }
  };

  const syncAll = async (): Promise<void> => {
    for (const id of [...jobs.keys()]) unregister(id);
    const rows = await deps.db.select().from(scheduledPrompts);
    for (const r of rows) register(r);
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
