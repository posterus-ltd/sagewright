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
import { createWorkflowDriver } from './workflows/workflow-driver';
import { SESSION_LABEL, createRunnerSpawner } from './tasks/runner-spawner';
import { createDockerClient, createContainerTerminal, createContainerExec } from './tasks/docker-client';
import { createAgentDriver } from './tasks/agent-driver';
import { createUserSettingsService } from './user-settings/user-settings-service';
import { createRunnerRegistry } from './runners/runner-registry';
import { buildApp } from './app';

const config = loadConfig(process.env);
const { db, pool } = createDb(config.databaseUrl);
const eventStore = createEventStore(db);
const eventBus = createEventBus();
// One shared dockerode client for both spawning and exec'ing into containers.
const docker = createDockerClient();
const spawner = createRunnerSpawner(config, () => docker);
const containerTerminal = createContainerTerminal(docker);
// Drives the predefined start script over `docker exec` and runs git/PR for headless sessions.
const containerExec = createContainerExec(docker);
const agentDriver = createAgentDriver({ db, eventStore, eventBus, exec: containerExec, retire: spawner.retire });
// Owns the shared repo volume: all clone/pull/worktree writes funnel through here.
const volume = createVolume({ token: config.githubToken });
const userEnvService = createUserEnvService({ db, cipher: createSecretCipher(config.secretsKey) });
const githubCredentialService = createGithubCredentialService({ db, cipher: createSecretCipher(config.secretsKey), config, userEnvService });
const repoService = createRepoService({ db, volume, githubCredentialService });
const canvasLayoutService = createCanvasLayoutService({ db });
const userSettingsService = createUserSettingsService({ db });
const runnerRegistry = createRunnerRegistry({ docker });
// The single seam every run path provisions through. Owns insert→spawn→container_id
// and the FAILED-on-throw contract; task/workflow services attach the drive policy.
const sessionService = createSessionService({ db, eventStore, eventBus, spawner, volume, config, userEnvService, githubCredentialService, userSettingsService, runnerRegistry });
// In-process registry of live interactive agent execs, decoupled from the browser socket.
const sessionRuntime = createSessionRuntime({ agentDriver });
const taskService = createTaskService({ db, eventStore, eventBus, spawner, agentDriver, volume, sessionService, sessionRuntime });
const workflowService = createWorkflowService({ db });
const workflowDriver = createWorkflowDriver({ db, spawner, sessionService, agentDriver, exec: containerExec, volume, config, githubCredentialService });
// Single-leader scheduling across replicas: only the instance that wins this advisory
// lock runs the crons. `pg_try_advisory_lock` is CONNECTION-scoped, so the lock must be
// taken — and held — on one stable connection. Using `pool.query` would check out a
// different pooled connection on each call, and the lock (still held by the first,
// now-idle connection) would make every later acquire() observe it as taken — the
// leader would disable its own crons on the next sync. So we pin one dedicated client.
const SCHEDULER_LOCK_KEY = 0x5a6e_7c01; // arbitrary fixed key for the scheduler lock
let leaderClient: import('pg').PoolClient | null = null;
let isLeader = false;
// Assigned once the scheduler exists (it is constructed below, after this closure).
let onLeaderLoss: () => void = () => {};
const scheduler = createScheduler({
  db,
  taskService,
  workflowService,
  workflowDriver,
  timezone: config.schedulerTimezone,
  leadership: {
    acquire: async () => {
      if (isLeader) return true; // already hold the lock — don't re-take it (avoids stacking the count)
      if (!leaderClient) {
        leaderClient = await pool.connect(); // pinned for the lock's lifetime
        // A dropped connection releases the advisory lock server-side, and an
        // unhandled 'error' event on a checked-out pg client would crash the whole
        // process. Demote ourselves instead: stop our crons (another instance may
        // now win the lock) and re-compete on a fresh client at the next sync.
        leaderClient.on('error', (err) => {
          console.error('scheduler leader connection lost; demoting', err);
          try {
            leaderClient?.release(true);
          } catch {
            // already destroyed
          }
          leaderClient = null;
          isLeader = false;
          onLeaderLoss();
        });
      }
      const res = await leaderClient.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [SCHEDULER_LOCK_KEY]);
      isLeader = res.rows[0]?.ok ?? false;
      return isLeader;
    },
  },
});
onLeaderLoss = () => scheduler.stopAll();
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
  // Every runner/ops box is labeled with its session id at spawn — the sweep's
  // only handle for containers whose id never reached a session row.
  listLabeledContainers: async () => {
    const list = await docker.listContainers({ all: true, filters: { label: [SESSION_LABEL] } });
    return list.map((c) => ({ containerId: c.Id, sessionId: c.Labels?.[SESSION_LABEL] ?? '' }));
  },
  retire: spawner.retire,
  removeSessionWorktrees: volume.removeSessionWorktrees,
  resumeWorkflow: workflowDriver.resume,
});

const app = buildApp({ config, db, eventStore, eventBus, sessionService, sessionRuntime, taskService, repoService, userEnvService, githubCredentialService, userSettingsService, canvasLayoutService, workflowService, workflowDriver, containerTerminal, volume, scheduler, runnerRegistry });

// The scheduler is built before the app (the app depends on it), so hand it the
// Fastify logger now that the app exists — failed scheduled runs go to the app log.
scheduler.setLogger({ error: (err, msg) => app.log.error({ err: String(err) }, msg) });

const start = async (): Promise<void> => {
  try {
    // Surface a stale operator default loudly at boot. The fallback image is trusted
    // (it's used whenever a user has no stored default), so if it isn't actually built
    // every such task — including scheduled runs — would 404 at container creation.
    const available = await runnerRegistry.list().catch(() => []);
    if (!available.some((w) => w.image === config.runnerImage)) {
      app.log.warn(
        `Configured RUNNER_IMAGE "${config.runnerImage}" is not a built runner image ` +
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
