import { createSessionSchema, postMessageSchema, updateSessionSchema, type Session } from '@sagewright/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';

import type { AppDeps } from '../app';
import { inboundMessages } from '../db/schema';

// Per-session operations are owner-scoped: a missing session is 404, one owned by a
// different user is 403. Returns the owned session, or null after sending the error
// response, so callers `if (!s) return reply;`.
const ownedOr = async (
  deps: AppDeps,
  id: string,
  requester: string,
  reply: FastifyReply,
): Promise<Session | null> => {
  const session = await deps.taskService.get(id);
  if (!session) {
    reply.code(404).send({ error: 'not found' });
    return null;
  }
  if (session.createdBy !== requester) {
    reply.code(403).send({ error: 'forbidden' });
    return null;
  }
  return session;
};

export const registerTaskRoutes = (app: FastifyInstance, deps: AppDeps): void => {
  app.post('/api/tasks', { preHandler: app.requireUser }, async (req, reply) => {
    const input = createSessionSchema.parse(req.body);
    const task = await deps.taskService.create(input, req.displayName!);
    return reply.code(201).send(task);
  });

  app.get('/api/tasks', { preHandler: app.requireUser }, async (req) => {
    const { mine } = req.query as { mine?: string };
    return deps.taskService.list(mine ? req.displayName : undefined);
  });

  app.get('/api/tasks/:id', { preHandler: app.requireUser }, async (req, reply) => {
    const session = await ownedOr(deps, (req.params as { id: string }).id, req.displayName!, reply);
    return session ?? reply;
  });

  app.patch('/api/tasks/:id', { preHandler: app.requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await ownedOr(deps, id, req.displayName!, reply))) return reply;
    const input = updateSessionSchema.parse(req.body);
    const task = await deps.taskService.update(id, input);
    return task ?? reply.code(404).send({ error: 'not found' });
  });

  app.post('/api/tasks/:id/stop', { preHandler: app.requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await ownedOr(deps, id, req.displayName!, reply))) return reply;
    await deps.taskService.stop(id);
    return { ok: true };
  });

  // Finalize an interactive session: push the agent's work, open PRs, and retire the box.
  // `stop` aborts without a PR; `complete` is the "I'm done, ship it" path.
  app.post('/api/tasks/:id/complete', { preHandler: app.requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await ownedOr(deps, id, req.displayName!, reply))) return reply;
    await deps.sessionRuntime.complete(id);
    return { ok: true };
  });

  app.post('/api/tasks/:id/archive', { preHandler: app.requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await ownedOr(deps, id, req.displayName!, reply))) return reply;
    await deps.taskService.archive(id);
    return { ok: true };
  });

  app.delete('/api/tasks/:id', { preHandler: app.requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await ownedOr(deps, id, req.displayName!, reply))) return reply;
    await deps.taskService.remove(id);
    return { ok: true };
  });

  app.post('/api/tasks/:id/messages', { preHandler: app.requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await ownedOr(deps, id, req.displayName!, reply))) return reply;
    const { body } = postMessageSchema.parse(req.body);
    await deps.db.insert(inboundMessages).values({ sessionId: id, body });
    return reply.code(202).send({ ok: true });
  });
};
