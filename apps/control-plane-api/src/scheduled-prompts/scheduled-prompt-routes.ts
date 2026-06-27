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
  workerImage: r.workerImage,
  lastRunAt: r.lastRunAt ? r.lastRunAt.toISOString() : null,
  createdAt: r.createdAt.toISOString(),
});

export const registerScheduledPromptRoutes = (app: FastifyInstance, deps: AppDeps): void => {
  app.get('/api/scheduled-prompts', { preHandler: app.requireUser }, async () => {
    const rows = await deps.db.select().from(scheduledPrompts);
    return rows.map(rowToScheduled);
  });

  // Reject a worker image that isn't a built/registered image, mirroring the task and
  // default-worker routes. Skipped when unset (the run inherits the creator's default).
  const validWorkerImage = async (image: string | null | undefined): Promise<boolean> => {
    if (!image) return true;
    const workers = await deps.workerRegistry.list();
    return workers.some((w) => w.image === image);
  };

  app.post('/api/scheduled-prompts', { preHandler: app.requireUser }, async (req, reply) => {
    const body = createScheduledPromptSchema.parse(req.body);
    if (!deps.scheduler.isValidCron(body.cron)) return reply.code(400).send({ error: 'invalid cron' });
    if (!(await validWorkerImage(body.workerImage))) {
      return reply.code(400).send({ error: 'unknown worker image' });
    }
    const [row] = await deps.db
      .insert(scheduledPrompts)
      .values({ cron: body.cron, prompt: body.prompt, enabled: body.enabled, workerImage: body.workerImage ?? null, createdBy: req.displayName! })
      .returning();
    await deps.scheduler.sync();
    return reply.code(201).send(rowToScheduled(row));
  });

  app.put('/api/scheduled-prompts/:id', { preHandler: app.requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateScheduledPromptSchema.parse(req.body);
    if (body.cron !== undefined && !deps.scheduler.isValidCron(body.cron)) {
      return reply.code(400).send({ error: 'invalid cron' });
    }
    if (body.workerImage !== undefined && !(await validWorkerImage(body.workerImage))) {
      return reply.code(400).send({ error: 'unknown worker image' });
    }
    const [row] = await deps.db.update(scheduledPrompts).set(body).where(eq(scheduledPrompts.id, id)).returning();
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
