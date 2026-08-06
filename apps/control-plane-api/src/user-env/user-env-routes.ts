import { maskEnvBlob } from '@sagewright/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppDeps } from '../app';

const putBody = z.object({ env: z.string() });

export const registerUserEnvRoutes = (app: FastifyInstance, deps: AppDeps): void => {
  // Masked view: keys/comments preserved, every value rendered as *******.
  app.get('/api/user-env', { preHandler: app.requireUser }, async (req) => {
    const plaintext = await deps.userEnvService.get(req.userId!);
    return { env: maskEnvBlob(plaintext) };
  });

  // Plaintext — only hit when the user toggles "reveal" to edit.
  app.get('/api/user-env/reveal', { preHandler: app.requireUser }, async (req) => {
    return { env: await deps.userEnvService.get(req.userId!) };
  });

  app.put('/api/user-env', { preHandler: app.requireUser }, async (req, reply) => {
    const parsed = putBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'env must be a string' });
    await deps.userEnvService.set(req.userId!, parsed.data.env);
    return reply.code(204).send();
  });
};
