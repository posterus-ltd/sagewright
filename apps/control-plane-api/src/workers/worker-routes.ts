import type { FastifyInstance } from 'fastify';

import type { UserSettingsService } from '../user-settings/user-settings-service';
import type { WorkerRegistry } from './worker-registry';

interface WorkerRouteDeps {
  workerRegistry: WorkerRegistry;
  userSettingsService: UserSettingsService;
  config: { workerImage: string };
}

export const registerWorkerRoutes = (app: FastifyInstance, deps: WorkerRouteDeps): void => {
  app.get('/api/workers', { preHandler: app.requireUser }, async (req) => {
    const workers = await deps.workerRegistry.list();
    const stored = await deps.userSettingsService.getDefaultWorker(req.displayName!);
    return { workers, defaultImage: stored ?? deps.config.workerImage };
  });
};
