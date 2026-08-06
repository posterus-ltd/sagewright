import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

import type { RunnerRegistry } from '../runners/runner-registry';
import type { UserSettingsService } from './user-settings-service';

interface UserSettingsRouteDeps {
  userSettingsService: UserSettingsService;
  runnerRegistry: RunnerRegistry;
  config: { runnerImage: string };
}

export const registerUserSettingsRoutes = (app: FastifyInstance, deps: UserSettingsRouteDeps): void => {
  app.get('/api/settings/default-runner', { preHandler: app.requireUser }, async (req) => {
    const stored = await deps.userSettingsService.getDefaultRunner(req.userId!);
    return { defaultImage: stored ?? deps.config.runnerImage };
  });

  app.put('/api/settings/default-runner', { preHandler: app.requireUser }, async (req, reply) => {
    const parsed = z.object({ image: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'image must be a non-empty string' });
    const runners = await deps.runnerRegistry.list();
    if (!runners.some((w) => w.image === parsed.data.image)) {
      return reply.code(400).send({ error: 'unknown runner image' });
    }
    await deps.userSettingsService.setDefaultRunner(req.userId!, parsed.data.image);
    return reply.code(204).send();
  });
};
