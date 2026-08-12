import { workspacesSchema } from '@sagewright/shared';
import type { FastifyInstance } from 'fastify';

import type { AppDeps } from '../app';

export const registerWorkspacesRoutes = (app: FastifyInstance, deps: AppDeps): void => {
  // The user's saved workspaces, or an empty blob if they've never built one.
  app.get('/api/workspaces', { preHandler: app.requireUser }, async (req) => {
    return deps.workspacesService.get(req.userId!);
  });

  app.put('/api/workspaces', { preHandler: app.requireUser }, async (req, reply) => {
    const parsed = workspacesSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid workspaces' });
    await deps.workspacesService.set(req.userId!, parsed.data);
    return reply.code(204).send();
  });
};
