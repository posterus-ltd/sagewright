import { createTaskSchema, postMessageSchema, updateTaskSchema } from '@sagewright/shared';
import type { FastifyInstance } from 'fastify';

import type { AppDeps } from '../app';
import { inboundMessages } from '../db/schema';

export const registerTaskRoutes = (app: FastifyInstance, deps: AppDeps): void => {
  app.post('/api/tasks', { preHandler: app.requireUser }, async (req, reply) => {
    const input = createTaskSchema.parse(req.body);
    const task = await deps.taskService.create(input, req.displayName!);
    return reply.code(201).send(task);
  });

  app.get('/api/tasks', { preHandler: app.requireUser }, async (req) => {
    const { mine } = req.query as { mine?: string };
    return deps.taskService.list(mine ? req.displayName : undefined);
  });

  app.get('/api/tasks/:id', { preHandler: app.requireUser }, async (req, reply) => {
    const task = await deps.taskService.get((req.params as { id: string }).id);
    return task ?? reply.code(404).send({ error: 'not found' });
  });

  app.patch('/api/tasks/:id', { preHandler: app.requireUser }, async (req, reply) => {
    const input = updateTaskSchema.parse(req.body);
    const task = await deps.taskService.update((req.params as { id: string }).id, input);
    return task ?? reply.code(404).send({ error: 'not found' });
  });

  app.post('/api/tasks/:id/stop', { preHandler: app.requireUser }, async (req) => {
    await deps.taskService.stop((req.params as { id: string }).id);
    return { ok: true };
  });

  // Finalize an interactive session: push the agent's work, open PRs, and retire the box.
  // `stop` aborts without a PR; `complete` is the "I'm done, ship it" path.
  app.post('/api/tasks/:id/complete', { preHandler: app.requireUser }, async (req) => {
    await deps.sessionRuntime.complete((req.params as { id: string }).id);
    return { ok: true };
  });

  app.post('/api/tasks/:id/archive', { preHandler: app.requireUser }, async (req) => {
    await deps.taskService.archive((req.params as { id: string }).id);
    return { ok: true };
  });

  app.delete('/api/tasks/:id', { preHandler: app.requireUser }, async (req) => {
    await deps.taskService.remove((req.params as { id: string }).id);
    return { ok: true };
  });

  app.post('/api/tasks/:id/messages', { preHandler: app.requireUser }, async (req, reply) => {
    const { body } = postMessageSchema.parse(req.body);
    await deps.db.insert(inboundMessages).values({ taskId: (req.params as { id: string }).id, body });
    return reply.code(202).send({ ok: true });
  });
};
