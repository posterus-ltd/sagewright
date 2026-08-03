import type { FastifyInstance } from 'fastify';

import type { UserSettingsService } from '../user-settings/user-settings-service';
import type { RunnerRegistry } from './runner-registry';

interface RunnerRouteDeps {
  runnerRegistry: RunnerRegistry;
  userSettingsService: UserSettingsService;
  config: { runnerImage: string };
}

export const registerRunnerRoutes = (app: FastifyInstance, deps: RunnerRouteDeps): void => {
  app.get('/api/runners', { preHandler: app.requireUser }, async (req) => {
    const runners = await deps.runnerRegistry.list();
    const stored = await deps.userSettingsService.getDefaultRunner(req.displayName!);
    return { runners, defaultImage: stored ?? deps.config.runnerImage };
  });
};
