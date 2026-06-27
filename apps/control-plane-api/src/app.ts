import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';

import { registerAuth } from './auth/auth-plugin';
import type { AppConfig } from './config';
import type { Db } from './db/client';
import type { EventBus } from './events/event-bus';
import type { EventStore } from './events/event-store';
import type { Volume } from './git/volume';
import type { Scheduler } from './scheduled-prompts/scheduler';
import { registerStreamRoute } from './events/stream-route';
import { registerTerminalRoute } from './events/terminal-route';
import { registerRepoRoutes } from './repos/repo-routes';
import { registerScheduledPromptRoutes } from './scheduled-prompts/scheduled-prompt-routes';
import { registerTaskRoutes } from './tasks/task-routes';
import { registerUserEnvRoutes } from './user-env/user-env-routes';
import { registerUserSettingsRoutes } from './user-settings/user-settings-routes';
import { registerWorkerRoutes } from './workers/worker-routes';
import { registerCanvasLayoutRoutes } from './canvas-layout/canvas-layout-routes';
import { registerGithubRoutes } from './github/github-routes';
import type { RepoService } from './repos/repo-service';
import type { TaskService } from './tasks/task-service';
import type { UserEnvService } from './user-env/user-env-service';
import type { UserSettingsService } from './user-settings/user-settings-service';
import type { CanvasLayoutService } from './canvas-layout/canvas-layout-service';
import type { ContainerTerminal } from './tasks/docker-client';
import type { WorkerRegistry } from './workers/worker-registry';
import type { GithubCredentialService } from './github/github-credential-service';

export interface AppDeps {
  config: AppConfig;
  db: Db;
  eventStore: EventStore;
  eventBus: EventBus;
  taskService: TaskService;
  repoService: RepoService;
  userEnvService: UserEnvService;
  githubCredentialService: GithubCredentialService;
  userSettingsService: UserSettingsService;
  canvasLayoutService: CanvasLayoutService;
  containerTerminal: ContainerTerminal;
  volume: Volume;
  scheduler: Scheduler;
  workerRegistry: WorkerRegistry;
  webDistPath?: string;
}

// Resolve the default web dist path relative to this file in the built output.
// Built layout in the container:
//   /app/apps/control-plane-api/dist/main.js  (this file's __dirname)
//   /app/dist/control-plane-web/              (the web build output)
const resolveDefaultWebDist = (): string => {
  try {
    const selfDir = path.dirname(fileURLToPath(import.meta.url));
    // Three levels up: dist/ → apps/control-plane-api/ → apps/ → /app, then dist/control-plane-web
    return path.resolve(selfDir, '../../..', 'dist/control-plane-web');
  } catch {
    // Fallback for environments where import.meta.url is not resolvable
    return path.resolve('dist/control-plane-web');
  }
};

export const buildApp = (deps: AppDeps): FastifyInstance => {
  const app = Fastify({ logger: true });

  registerAuth(app, {
    appPassword: deps.config.appPassword,
    sessionSecret: deps.config.sessionSecret,
  });

  registerRepoRoutes(app, deps);
  registerScheduledPromptRoutes(app, deps);
  registerTaskRoutes(app, deps);
  registerUserEnvRoutes(app, deps);
  registerGithubRoutes(app, deps);
  registerUserSettingsRoutes(app, deps);
  registerWorkerRoutes(app, deps);
  registerCanvasLayoutRoutes(app, deps);

  registerStreamRoute(app, deps);

  // WebSocket routes live in a child context registered AFTER @fastify/websocket
  // so the plugin's onRoute hook is active when the route is added. requireUser
  // and the cookie parser are inherited from the parent instance.
  void app.register(async (instance) => {
    await instance.register(fastifyWebsocket);
    registerTerminalRoute(instance, deps);
  });

  // Serve the built web SPA only when the dist directory exists.
  // This keeps makeTestApp() working (no dist in test environment).
  const webDistPath = deps.webDistPath ?? resolveDefaultWebDist();
  if (fs.existsSync(webDistPath)) {
    void app.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
    });

    // SPA fallback: serve index.html for all non-/api, non-/internal GET routes.
    app.setNotFoundHandler(async (req, reply) => {
      const url = req.url;
      if (
        req.method === 'GET' &&
        !url.startsWith('/api/') &&
        !url.startsWith('/internal/')
      ) {
        return reply.sendFile('index.html');
      }
      reply.code(404).send({ error: 'Not Found' });
    });
  }

  return app;
};
