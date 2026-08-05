import { createUserSchema, setUserRoleSchema, usernameSchema } from '@sagewright/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';

import { UserServiceError, type UserErrorCode, type UserService } from './user-service';

interface UserRouteDeps {
  userService: UserService;
}

const STATUS_FOR: Record<UserErrorCode, number> = {
  conflict: 409,
  not_found: 404,
  forbidden: 403,
  invalid_current: 400,
};

// Map a domain error to its HTTP status; re-throw anything else so it surfaces as a 500.
const sendError = (err: unknown, reply: FastifyReply): FastifyReply => {
  if (err instanceof UserServiceError) return reply.code(STATUS_FOR[err.code]).send({ error: err.message });
  throw err;
};

export const registerUserRoutes = (app: FastifyInstance, deps: UserRouteDeps): void => {
  app.get('/api/users', { preHandler: app.requireAdmin }, async () => deps.userService.list());

  app.post('/api/users', { preHandler: app.requireAdmin }, async (req, reply) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
    }
    try {
      return await deps.userService.create(parsed.data.username, parsed.data.role);
    } catch (err) {
      return sendError(err, reply);
    }
  });

  app.post('/api/users/:username/reset-password', { preHandler: app.requireAdmin }, async (req, reply) => {
    const parsed = usernameSchema.safeParse((req.params as { username: string }).username);
    if (!parsed.success) return reply.code(404).send({ error: 'user not found' });
    try {
      return await deps.userService.resetPassword(parsed.data);
    } catch (err) {
      return sendError(err, reply);
    }
  });

  app.patch('/api/users/:username', { preHandler: app.requireAdmin }, async (req, reply) => {
    const name = usernameSchema.safeParse((req.params as { username: string }).username);
    if (!name.success) return reply.code(404).send({ error: 'user not found' });
    const body = setUserRoleSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'invalid role' });
    try {
      await deps.userService.setRole(name.data, body.data.role);
      return reply.code(204).send();
    } catch (err) {
      return sendError(err, reply);
    }
  });

  app.delete('/api/users/:username', { preHandler: app.requireAdmin }, async (req, reply) => {
    const parsed = usernameSchema.safeParse((req.params as { username: string }).username);
    if (!parsed.success) return reply.code(404).send({ error: 'user not found' });
    try {
      await deps.userService.remove(parsed.data, req.displayName!);
      return reply.code(204).send();
    } catch (err) {
      return sendError(err, reply);
    }
  });
};
