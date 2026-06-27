import { loadConfig } from './config';
import { createSecretCipher } from './crypto/secret-cipher';
import { createDb } from './db/client';
import { createEventBus } from './events/event-bus';
import { createEventStore } from './events/event-store';
import { createVolume } from './git/volume';
import { createScheduler } from './scheduled-prompts/scheduler';
import { createRepoService } from './repos/repo-service';
import { createTaskService } from './tasks/task-service';
import { createUserEnvService } from './user-env/user-env-service';
import { createCanvasLayoutService } from './canvas-layout/canvas-layout-service';
import { createWorkerSpawner } from './tasks/worker-spawner';
import { createDockerClient, createContainerTerminal, createContainerExec } from './tasks/docker-client';
import { createAgentRunner } from './tasks/agent-runner';
import { createUserSettingsService } from './user-settings/user-settings-service';
import { createWorkerRegistry } from './workers/worker-registry';
import { buildApp } from './app';

const config = loadConfig(process.env);
const { db, pool } = createDb(config.databaseUrl);
const eventStore = createEventStore(db);
const eventBus = createEventBus();
// One shared dockerode client for both spawning and exec'ing into containers.
const docker = createDockerClient();
const spawner = createWorkerSpawner(config, () => docker);
const containerTerminal = createContainerTerminal(docker);
// Drives the predefined start script over `docker exec` and runs git/PR for headless tasks.
const containerExec = createContainerExec(docker);
const agentRunner = createAgentRunner({ db, eventStore, eventBus, exec: containerExec, retire: spawner.retire });
// Owns the shared repo volume: all clone/pull/worktree writes funnel through here.
const volume = createVolume({ token: config.githubToken });
const userEnvService = createUserEnvService({ db, cipher: createSecretCipher(config.secretsKey) });
const repoService = createRepoService({ db, volume, userEnvService });
const canvasLayoutService = createCanvasLayoutService({ db });
const userSettingsService = createUserSettingsService({ db });
const workerRegistry = createWorkerRegistry({ docker });
const taskService = createTaskService({ db, eventStore, eventBus, spawner, agentRunner, volume, config, userEnvService, userSettingsService, workerRegistry });
const scheduler = createScheduler({ db, taskService });

const app = buildApp({ config, db, eventStore, eventBus, taskService, repoService, userEnvService, userSettingsService, canvasLayoutService, containerTerminal, volume, scheduler, workerRegistry });

// The scheduler is built before the app (the app depends on it), so hand it the
// Fastify logger now that the app exists — failed scheduled runs go to the app log.
scheduler.setLogger({ error: (err, msg) => app.log.error({ err: String(err) }, msg) });

const start = async (): Promise<void> => {
  try {
    // Surface a stale operator default loudly at boot. The fallback image is trusted
    // (it's used whenever a user has no stored default), so if it isn't actually built
    // every such task — including scheduled runs — would 404 at container creation.
    const available = await workerRegistry.list().catch(() => []);
    if (!available.some((w) => w.image === config.workerImage)) {
      app.log.warn(
        `Configured WORKER_IMAGE "${config.workerImage}" is not a built worker image ` +
          `(found: ${available.map((w) => w.image).join(', ') || 'none'}). ` +
          `Sessions falling back to this default will fail at container creation.`,
      );
    }
    await scheduler.start();
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`control-plane-api listening on port ${config.port}`);
  } catch (err) {
    app.log.error(err);
    await pool.end();
    process.exit(1);
  }
};

start();
