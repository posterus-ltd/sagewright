import { runWorkflowSchema, TriggerType, updateWorkflowSchema, workflowInputSchema } from '@sagewright/shared';
import type { FastifyInstance } from 'fastify';

import type { AppDeps } from '../app';

/** Validate every step's runner image against the built/registered images. */
const assertRunnerImages = async (deps: AppDeps, images: string[]): Promise<string | null> => {
  const runners = await deps.runnerRegistry.list();
  const known = new Set(runners.map((w) => w.image));
  const missing = images.find((image) => !known.has(image));
  return missing ? `unknown runner image: ${missing}` : null;
};

/** Validate a cron trigger's expression — the scheduler silently skips a cron it
 *  cannot parse, so a bad one saved here would just never fire. Mirrors the
 *  scheduled-prompt routes. */
const assertCronTrigger = (
  deps: AppDeps,
  trigger: { type: TriggerType; cron?: string | undefined },
): string | null =>
  trigger.type === TriggerType.CRON && trigger.cron && !deps.scheduler.isValidCron(trigger.cron)
    ? 'invalid cron'
    : null;

export const registerWorkflowRoutes = (app: FastifyInstance, deps: AppDeps): void => {
  app.get('/api/workflows', { preHandler: app.requireUser }, async () => deps.workflowService.list());

  app.get('/api/workflows/:id', { preHandler: app.requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const wf = await deps.workflowService.get(id);
    if (!wf) return reply.code(404).send({ error: 'not found' });
    return wf;
  });

  app.post('/api/workflows', { preHandler: app.requireUser }, async (req, reply) => {
    const parsed = workflowInputSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid workflow', details: parsed.error.issues });
    const err =
      (await assertRunnerImages(deps, parsed.data.definition.steps.map((s) => s.runnerImage))) ??
      assertCronTrigger(deps, parsed.data.definition.trigger);
    if (err) return reply.code(400).send({ error: err });
    const wf = await deps.workflowService.create(parsed.data, req.displayName!);
    await deps.scheduler.sync(); // pick up a cron trigger immediately
    return reply.code(201).send(wf);
  });

  app.put('/api/workflows/:id', { preHandler: app.requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateWorkflowSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid workflow', details: parsed.error.issues });
    if (parsed.data.definition) {
      const err =
        (await assertRunnerImages(deps, parsed.data.definition.steps.map((s) => s.runnerImage))) ??
        assertCronTrigger(deps, parsed.data.definition.trigger);
      if (err) return reply.code(400).send({ error: err });
    }
    const wf = await deps.workflowService.update(id, parsed.data);
    if (!wf) return reply.code(404).send({ error: 'not found' });
    await deps.scheduler.sync(); // a toggled/edited cron trigger takes effect now
    return wf;
  });

  app.delete('/api/workflows/:id', { preHandler: app.requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await deps.workflowService.remove(id);
    await deps.scheduler.sync(); // drop any cron job for the removed workflow
    return reply.code(204).send();
  });

  // Manually trigger a run. Optional `input` (e.g. feature requirements) seeds step 1.
  app.post('/api/workflows/:id/run', { preHandler: app.requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = runWorkflowSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'invalid run input' });
    const run = await deps.workflowDriver.start(id, req.displayName!, parsed.data.input);
    if (!run) return reply.code(404).send({ error: 'workflow not found' });
    return reply.code(201).send(run);
  });

  app.get('/api/workflows/runs', { preHandler: app.requireUser }, async (req) => {
    const { workflowId } = req.query as { workflowId?: string };
    return deps.workflowService.listRuns(workflowId);
  });

  app.get('/api/workflows/runs/:id', { preHandler: app.requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const detail = await deps.workflowService.getRunDetail(id);
    if (!detail) return reply.code(404).send({ error: 'not found' });
    return detail;
  });
};
