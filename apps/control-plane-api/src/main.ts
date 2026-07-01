import { loadConfig } from './config';
import { createSecretCipher } from './crypto/secret-cipher';
import { createDb } from './db/client';
import { createEventBus } from './events/event-bus';
import { createEventStore } from './events/event-store';
import { createVolume } from './git/volume';
import { createScheduler } from './scheduled-prompts/scheduler';
import { createRepoService } from './repos/repo-service';
import { createReconciler } from './sessions/reconciler';
import { createSessionRuntime } from './sessions/session-runtime';
import { createSessionService } from './sessions/session-service';
import { createTaskService } from './tasks/task-service';
import { createUserEnvService } from './user-env/user-env-service';
import { createGithubCredentialService } from './github/github-credential-service';
import { createCanvasLayoutService } from './canvas-layout/canvas-layout-service';
import { createWorkflowService } from './workflows/workflow-service';
import { createWorkflowRunner } from './workflows/workflow-runner';
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
// Drives the predefined start script over `docker exec` and runs git/PR for headless sessions.
const containerExec = createContainerExec(docker);
const agentRunner = createAgentRunner({ db, eventStore, eventBus, exec: containerExec, retire: spawner.retire });
// Owns the shared repo volume: all clone/pull/worktree writes funnel through here.
const volume = createVolume({ token: config.githubToken });
const userEnvService = createUserEnvService({ db, cipher: createSecretCipher(config.secretsKey) });
const githubCredentialService = createGithubCredentialService({ db, cipher: createSecretCipher(config.secretsKey), config, userEnvService });
const repoService = createRepoService({ db, volume, githubCredentialService });
const canvasLayoutService = createCanvasLayoutService({ db });
const userSettingsService = createUserSettingsService({ db });
const workerRegistry = createWorkerRegistry({ docker });
// The single seam every run path provisions through. Owns insert→spawn→container_id
// and the FAILED-on-throw contract; task/workflow services attach the drive policy.
const sessionService = createSessionService({ db, eventStore, eventBus, spawner, volume, config, userEnvService, githubCredentialService, userSettingsService, workerRegistry });
// In-process registry of live interactive agent execs, decoupled from the browser socket.
const sessionRuntime = createSessionRuntime({ agentRunner });
const taskService = createTaskService({ db, eventStore, eventBus, spawner, agentRunner, volume, sessionService, sessionRuntime });
const workflowService = createWorkflowService({ db });
const workflowRunner = createWorkflowRunner({ db, spawner, sessionService, agentRunner, exec: containerExec, volume, config, githubCredentialService });
// Single-leader scheduling across replicas: only the instance that wins this advisory
// lock runs the crons. `pg_try_advisory_lock` is CONNECTION-scoped, so the lock must be
// taken — and held — on one stable connection. Using `pool.query` would check out a
// different pooled connection on each call, and the lock (still held by the first,
// now-idle connection) would make every later acquire() observe it as taken — the
// leader would disable its own crons on the next sync. So we pin one dedicated client.
const SCHEDULER_LOCK_KEY = 0x5a6e_7c01; // arbitrary fixed key for the scheduler lock
let leaderClient: import('pg').PoolClient | null = null;
let isLeader = false;
const scheduler = createScheduler({
  db,
  taskService,
  workflowService,
  workflowRunner,
  leadership: {
    acquire: async () => {
      if (isLeader) return true; // already hold the lock — don't re-take it (avoids stacking the count)
      if (!leaderClient) leaderClient = await pool.connect(); // pinned for the lock's lifetime
      const res = await leaderClient.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [SCHEDULER_LOCK_KEY]);
      isLeader = res.rows[0]?.ok ?? false;
      return isLeader;
    },
  },
});
// Boot-time DB↔container reconciliation. A container is "alive" if dockerode can inspect it.
const reconciler = createReconciler({
  db,
  eventStore,
  eventBus,
  containerAlive: async (id) => {
    try {
      await docker.getContainer(id).inspect();
      return true;
    } catch {
      return false;
    }
  },
  retire: spawner.retire,
  removeSessionWorktrees: volume.removeSessionWorktrees,
  resumeWorkflow: workflowRunner.resume,
});

const app = buildApp({ config, db, eventStore, eventBus, sessionService, sessionRuntime, taskService, repoService, userEnvService, githubCredentialService, userSettingsService, canvasLayoutService, workflowService, workflowRunner, containerTerminal, volume, scheduler, workerRegistry });

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
    // Reconcile DB↔container reality BEFORE accepting traffic so the API never serves
    // stale 'running' rows or leaks orphaned containers across a restart.
    await reconciler.reconcile().catch((err) => app.log.error({ err: String(err) }, 'boot reconcile failed'));
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
