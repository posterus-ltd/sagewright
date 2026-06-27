import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

import type { WorkerRegistry } from '../workers/worker-registry';
import type { UserSettingsService } from './user-settings-service';

interface UserSettingsRouteDeps {
  userSettingsService: UserSettingsService;
  workerRegistry: WorkerRegistry;
  config: { workerImage: string };
}

export const registerUserSettingsRoutes = (app: FastifyInstance, deps: UserSettingsRouteDeps): void => {
  app.get('/api/settings/default-worker', { preHandler: app.requireUser }, async (req) => {
    const stored = await deps.userSettingsService.getDefaultWorker(req.displayName!);
    return { defaultImage: stored ?? deps.config.workerImage };
  });

  app.put('/api/settings/default-worker', { preHandler: app.requireUser }, async (req, reply) => {
    const parsed = z.object({ image: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'image must be a non-empty string' });
    const workers = await deps.workerRegistry.list();
    if (!workers.some((w) => w.image === parsed.data.image)) {
      return reply.code(400).send({ error: 'unknown worker image' });
    }
    await deps.userSettingsService.setDefaultWorker(req.displayName!, parsed.data.image);
    return reply.code(204).send();
  });
};
