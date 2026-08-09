import { userSettingsPatchSchema } from '@sagewright/shared';
import type { FastifyInstance } from 'fastify';

import type { RunnerRegistry } from '../runners/runner-registry';
import type { UserSettingsService } from './user-settings-service';

interface UserSettingsRouteDeps {
  userSettingsService: UserSettingsService;
  runnerRegistry: RunnerRegistry;
}

export const registerUserSettingsRoutes = (app: FastifyInstance, deps: UserSettingsRouteDeps): void => {
  // The caller's full settings object (defaults applied for anything unset).
  app.get('/api/settings', { preHandler: app.requireUser }, async (req) => {
    return deps.userSettingsService.get(req.userId!);
  });

  // Partial update: any subset of settings. Returns the merged result so the client can
  // refresh its cache without a follow-up GET. A new setting needs no new route — add it
  // to userSettingsSchema (@sagewright/shared) and its column.
  app.patch('/api/settings', { preHandler: app.requireUser }, async (req, reply) => {
    const parsed = userSettingsPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid settings' });
    }
    // The runner image, when set to a concrete value, must be one we can actually spawn.
    if (parsed.data.defaultRunnerImage != null) {
      const runners = await deps.runnerRegistry.list();
      if (!runners.some((w) => w.image === parsed.data.defaultRunnerImage)) {
        return reply.code(400).send({ error: 'unknown runner image' });
      }
    }
    const settings = await deps.userSettingsService.update(req.userId!, parsed.data);
    return reply.send(settings);
  });
};
