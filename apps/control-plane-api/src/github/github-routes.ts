import { GithubCredentialSource } from '@sagewright/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppDeps } from '../app';
import { GithubTokenValidationError } from './github-credential-service';

const putBody = z.object({ token: z.string() });

export const registerGithubRoutes = (app: FastifyInstance, deps: AppDeps): void => {
  app.get('/api/github/status', { preHandler: app.requireUser }, async (req) =>
    deps.githubCredentialService.getStatus(req.displayName!));

  app.put('/api/github/token', { preHandler: app.requireUser }, async (req, reply) => {
    const parsed = putBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'token must be a string' });
    try {
      const result = await deps.githubCredentialService.validateAndStore(
        req.displayName!,
        parsed.data.token,
        GithubCredentialSource.PAT,
      );
      return reply.send(result);
    } catch (err) {
      if (err instanceof GithubTokenValidationError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.delete('/api/github', { preHandler: app.requireUser }, async (req, reply) => {
    await deps.githubCredentialService.disconnect(req.displayName!);
    return reply.code(204).send();
  });
};
