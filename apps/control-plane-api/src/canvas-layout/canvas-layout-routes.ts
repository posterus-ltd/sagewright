import { canvasLayoutSchema } from '@sagewright/shared';
import type { FastifyInstance } from 'fastify';

import type { AppDeps } from '../app';

export const registerCanvasLayoutRoutes = (app: FastifyInstance, deps: AppDeps): void => {
  // The user's saved canvas, or an empty layout if they've never arranged one.
  app.get('/api/canvas-layout', { preHandler: app.requireUser }, async (req) => {
    return deps.canvasLayoutService.get(req.userId!);
  });

  app.put('/api/canvas-layout', { preHandler: app.requireUser }, async (req, reply) => {
    const parsed = canvasLayoutSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid canvas layout' });
    await deps.canvasLayoutService.set(req.userId!, parsed.data);
    return reply.code(204).send();
  });
};
