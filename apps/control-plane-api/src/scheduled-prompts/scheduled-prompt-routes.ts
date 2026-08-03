import { createScheduledPromptSchema, updateScheduledPromptSchema, type ScheduledPrompt } from '@sagewright/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { AppDeps } from '../app';
import { scheduledPrompts } from '../db/schema';

const rowToScheduled = (r: typeof scheduledPrompts.$inferSelect): ScheduledPrompt => ({
  id: r.id,
  cron: r.cron,
  prompt: r.prompt,
  enabled: r.enabled,
  runnerImage: r.runnerImage,
  lastRunAt: r.lastRunAt ? r.lastRunAt.toISOString() : null,
  createdAt: r.createdAt.toISOString(),
});

export const registerScheduledPromptRoutes = (app: FastifyInstance, deps: AppDeps): void => {
  app.get('/api/scheduled-prompts', { preHandler: app.requireUser }, async () => {
    const rows = await deps.db.select().from(scheduledPrompts);
    return rows.map(rowToScheduled);
  });

  // Reject a runner image that isn't a built/registered image, mirroring the task and
  // default-runner routes. Skipped when unset (the run inherits the creator's default).
  const validRunnerImage = async (image: string | null | undefined): Promise<boolean> => {
    if (!image) return true;
    const runners = await deps.runnerRegistry.list();
    return runners.some((w) => w.image === image);
  };

  app.post('/api/scheduled-prompts', { preHandler: app.requireUser }, async (req, reply) => {
    const body = createScheduledPromptSchema.parse(req.body);
    if (!deps.scheduler.isValidCron(body.cron)) return reply.code(400).send({ error: 'invalid cron' });
    if (!(await validRunnerImage(body.runnerImage))) {
      return reply.code(400).send({ error: 'unknown runner image' });
    }
    const [row] = await deps.db
      .insert(scheduledPrompts)
      .values({ cron: body.cron, prompt: body.prompt, enabled: body.enabled, runnerImage: body.runnerImage ?? null, createdBy: req.displayName! })
      .returning();
    await deps.scheduler.sync();
    return reply.code(201).send(rowToScheduled(row!));
  });

  app.put('/api/scheduled-prompts/:id', { preHandler: app.requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateScheduledPromptSchema.parse(req.body);
    if (body.cron !== undefined && !deps.scheduler.isValidCron(body.cron)) {
      return reply.code(400).send({ error: 'invalid cron' });
    }
    if (body.runnerImage !== undefined && !(await validRunnerImage(body.runnerImage))) {
      return reply.code(400).send({ error: 'unknown runner image' });
    }
    // Re-enabling resets the catch-up basis: a stale lastRunAt from before the pause
    // would read as a missed tick and fire the prompt the moment it's re-enabled.
    const [current] = await deps.db.select().from(scheduledPrompts).where(eq(scheduledPrompts.id, id)).limit(1);
    if (!current) return reply.code(404).send({ error: 'not found' });
    const reEnabled = body.enabled === true && !current.enabled;
    const [row] = await deps.db
      .update(scheduledPrompts)
      .set(reEnabled ? { ...body, lastRunAt: new Date() } : body)
      .where(eq(scheduledPrompts.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: 'not found' });
    await deps.scheduler.sync();
    return rowToScheduled(row);
  });

  app.delete('/api/scheduled-prompts/:id', { preHandler: app.requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await deps.db.delete(scheduledPrompts).where(eq(scheduledPrompts.id, id));
    await deps.scheduler.sync();
    return reply.code(204).send();
  });
};
