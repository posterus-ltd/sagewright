import { saveReposSchema } from '@sagewright/shared';
import type { FastifyInstance } from 'fastify';

import type { AppDeps } from '../app';

export const registerRepoRoutes = (app: FastifyInstance, deps: AppDeps): void => {
  // List the caller's configured repos with their live reconcile status on the volume.
  app.get('/api/repos', { preHandler: app.requireUser }, async (req) => {
    return deps.repoService.list(req.userId!);
  });

  // Save the caller's env-file-style URL list (one repo per line).
  app.put('/api/repos', { preHandler: app.requireUser }, async (req) => {
    const { urls } = saveReposSchema.parse(req.body);
    return deps.repoService.save(req.userId!, urls);
  });
};
