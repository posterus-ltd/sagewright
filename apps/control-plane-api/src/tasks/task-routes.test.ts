import { EventType, SessionStatus } from '@sagewright/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { loadConfig } from '../config';
import { inboundMessages, scheduledPrompts, sessions } from '../db/schema';
import { createSessionRuntime } from '../sessions/session-runtime';
import { createSessionService } from '../sessions/session-service';
import { fakeVolume, fakeWorkerRegistry, makeTestApp } from '../test/make-test-app';
import { createTaskService } from './task-service';
import type { SpawnInput } from './worker-spawner';

const fakeUserSettingsService = () => ({
  getDefaultWorker: async () => null as string | null,
  setDefaultWorker: async () => {},
});

const fakeGithubCredentialService = (token?: string) => ({
  resolve: async () => token ? { token, login: 'octo', name: 'Octo Cat', email: 'octo@example.com' } : undefined,
  validateAndStore: async () => ({ identity: { login: 'octo', name: null, email: 'octo@example.com' }, scopes: ['repo'], missingRepoScope: false }),
  getStatus: async () => ({ connected: false as const }),
  disconnect: async () => {},
});

// Provisioning now lives in the session seam; build it alongside the task service
// over the same db/spawner/volume/events so the create-path assertions still hold.
interface BuildServiceDeps {
  db: unknown;
  spawner: unknown;
  volume: unknown;
  eventStore?: unknown;
  eventBus?: unknown;
  agentRunner?: unknown;
  userEnvService?: unknown;
  githubCredentialService?: unknown;
  userSettingsService?: unknown;
  workerRegistry?: unknown;
  config?: unknown;
}

const buildService = (deps: BuildServiceDeps) => {
  const eventStore = deps.eventStore ?? { append: vi.fn(async () => []), readSince: vi.fn() };
  const eventBus = deps.eventBus ?? { publish: vi.fn(), subscribe: vi.fn() };
  const sessionService = createSessionService({
    db: deps.db as never,
    eventStore: eventStore as never,
    eventBus: eventBus as never,
    spawner: deps.spawner as never,
    volume: deps.volume as never,
    config: (deps.config ?? {}) as never,
    userEnvService: (deps.userEnvService ?? { get: async () => '' }) as never,
    githubCredentialService: (deps.githubCredentialService ?? fakeGithubCredentialService()) as never,
    userSettingsService: (deps.userSettingsService ?? fakeUserSettingsService()) as never,
    workerRegistry: (deps.workerRegistry ?? fakeWorkerRegistry()) as never,
  });
  const agentRunner = deps.agentRunner ?? { run: vi.fn(async () => {}), runInteractive: vi.fn(async () => 0), complete: vi.fn(async () => {}) };
  return createTaskService({
    db: deps.db as never,
    eventStore: eventStore as never,
    eventBus: eventBus as never,
    spawner: deps.spawner as never,
    agentRunner: agentRunner as never,
    volume: deps.volume as never,
    sessionService,
    sessionRuntime: createSessionRuntime({ agentRunner: agentRunner as never }),
  });
};

describe('task routes', () => {
  it('resumes a detached interactive session when a message arrives for it', async () => {
    const runInteractive = vi.fn(async () => 0);
    const sessionRuntime = createSessionRuntime({
      agentRunner: { runInteractive, complete: async () => {} } as never,
    });
    const { app, db } = await makeTestApp({ sessionRuntime });
    const login = await app.inject({ method: 'POST', url: '/api/login', payload: { displayName: 'al', password: 'pw' } });
    const c = login.cookies[0]!;
    const headers = { cookie: `${c.name}=${c.value}` };
    // A detached session (control-plane restarted since, so no runtime entry either).
    const [row] = await db
      .insert(sessions)
      .values({ kind: 'interactive', status: SessionStatus.DETACHED, createdBy: 'al', containerId: 'c-d' })
      .returning();

    const res = await app.inject({
      method: 'POST',
      url: `/api/tasks/${row!.id}/messages`,
      headers,
      payload: { body: 'also update the docs' },
    });

    expect(res.statusCode).toBe(202);
    // The message is queued AND a turn is resumed so its poll loop delivers it now —
    // not whenever a human next opens the terminal.
    const queued = await db.select().from(inboundMessages).where(eq(inboundMessages.sessionId, row!.id));
    expect(queued).toHaveLength(1);
    expect(runInteractive).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: row!.id, containerId: 'c-d' }),
      expect.objectContaining({ cmd: ['continue-agent'] }),
    );
  });

  it('does not resume for a message when a turn is already live', async () => {
    const runInteractive = vi.fn(() => new Promise<number>(() => undefined)); // never settles → stays live
    const sessionRuntime = createSessionRuntime({
      agentRunner: { runInteractive, complete: async () => {} } as never,
    });
    const { app, db } = await makeTestApp({ sessionRuntime });
    const login = await app.inject({ method: 'POST', url: '/api/login', payload: { displayName: 'al', password: 'pw' } });
    const c = login.cookies[0]!;
    const headers = { cookie: `${c.name}=${c.value}` };
    const [row] = await db
      .insert(sessions)
      .values({ kind: 'interactive', status: SessionStatus.RUNNING, createdBy: 'al', containerId: 'c-l' })
      .returning();
    sessionRuntime.start({ sessionId: row!.id, containerId: 'c-l', manifest: [], sessionDir: '/v' });
    expect(runInteractive).toHaveBeenCalledTimes(1);

    const res = await app.inject({
      method: 'POST',
      url: `/api/tasks/${row!.id}/messages`,
      headers,
      payload: { body: 'more' },
    });

    expect(res.statusCode).toBe(202);
    expect(runInteractive).toHaveBeenCalledTimes(1); // the live turn's poll delivers it
  });

  it('stop is a no-op on an already-terminal session (no retire, no status overwrite)', async () => {
    const retire = vi.fn(async () => {});
    const { db } = await makeTestApp();
    const service = buildService({ db, spawner: { spawn: vi.fn(), retire }, volume: fakeVolume() });
    const [row] = await db
      .insert(sessions)
      .values({ kind: 'headless', status: SessionStatus.DONE, createdBy: 'al', containerId: 'c-done' })
      .returning();
    const id = row!.id;

    await service.stop(id);

    expect(retire).not.toHaveBeenCalled();
    const [after] = await db.select().from(sessions).where(eq(sessions.id, id));
    expect(after!.status).toBe(SessionStatus.DONE);
  });

  it('stop on a workflow parent leaves the shared run worktree to the drive loop', async () => {
    const retire = vi.fn(async () => {});
    const removeSessionWorktrees = vi.fn(async () => undefined);
    const { db } = await makeTestApp();
    const service = buildService({
      db,
      spawner: { spawn: vi.fn(), retire },
      volume: fakeVolume({ removeSessionWorktrees }),
    });
    const [row] = await db
      .insert(sessions)
      .values({ kind: 'workflow', status: SessionStatus.RUNNING, createdBy: 'al' })
      .returning();
    const id = row!.id;

    await service.stop(id);

    // Yanking the worktree here would pull it out from under the executing step;
    // the drive loop notices STOPPED at the next boundary and sweeps it itself.
    expect(removeSessionWorktrees).not.toHaveBeenCalled();
    const [after] = await db.select().from(sessions).where(eq(sessions.id, id));
    expect(after!.status).toBe(SessionStatus.STOPPED);
    // Stopping ends the session — the row records when.
    expect(after!.endedAt).not.toBeNull();
  });

  it('creates an interactive session and spawns a worker', async () => {
    const spawn = vi.fn(async () => ({ containerId: 'c1' }));
    const addSessionWorktrees = vi.fn(async () => []);
    const { db } = await makeTestApp();

    const service = buildService({
      db,
      spawner: { spawn, retire: vi.fn() },
      volume: fakeVolume({ addSessionWorktrees }),
    });

    const task = await service.create({}, 'al');
    expect(task.status).toBe(SessionStatus.RUNNING);
    expect(task.kind).toBe('interactive');
    expect(task.prompt).toBeNull();
    expect(addSessionWorktrees).toHaveBeenCalledOnce();
    expect(spawn).toHaveBeenCalledOnce();
  });

  it('uses the resolved GitHub credential for worktrees and worker env', async () => {
    const spawn = vi.fn(async (_i: SpawnInput) => ({ containerId: 'c1' }));
    const addSessionWorktrees = vi.fn(async () => []);
    const { db } = await makeTestApp();

    const service = buildService({
      db,
      spawner: { spawn, retire: vi.fn() },
      volume: fakeVolume({ addSessionWorktrees }),
      userEnvService: { get: async () => 'GITHUB_TOKEN=legacy\nOTHER=ok' },
      githubCredentialService: fakeGithubCredentialService('resolved-token'),
    });

    await service.create({}, 'al');

    expect(addSessionWorktrees).toHaveBeenCalledWith(expect.any(String), [], 'resolved-token');
    expect(spawn.mock.calls[0]![0].userEnv).toMatchObject({ GITHUB_TOKEN: 'resolved-token', OTHER: 'ok' });
  });

  it('creates a headless task from the scheduler with a prompt', async () => {
    const spawn = vi.fn(async (_i: SpawnInput) => ({ containerId: 'c1' }));
    const { db } = await makeTestApp();
    const [sp] = await db
      .insert(scheduledPrompts)
      .values({ cron: '0 9 * * *', prompt: 'nightly', createdBy: 'scheduler' })
      .returning();
    const service = buildService({
      db,
      spawner: { spawn, retire: vi.fn() },
      volume: fakeVolume(),
    });

    const task = await service.create({ prompt: 'nightly' }, 'scheduler', { scheduledPromptId: sp!.id });
    // A scheduled fire records kind='scheduled' (its worker mode is still headless).
    expect(task.kind).toBe('scheduled');
    expect(task.prompt).toBe('nightly');
    expect(task.scheduledPromptId).toBe(sp!.id);
    expect(spawn.mock.calls[0]![0]).toMatchObject({ mode: 'headless', prompt: 'nightly' });
  });

  it('tears down worktrees and fails the task on spawn error', async () => {
    const spawnError = new Error('docker unavailable');
    const removeSessionWorktrees = vi.fn(async () => undefined);
    const { db } = await makeTestApp();

    const eventStore = (await import('../events/event-store')).createEventStore(db as never);
    const eventBus = (await import('../events/event-bus')).createEventBus();

    const service = buildService({
      db,
      eventStore,
      eventBus,
      spawner: { spawn: vi.fn(async () => { throw spawnError; }), retire: vi.fn() },
      volume: fakeVolume({ removeSessionWorktrees }),
    });

    await expect(service.create({}, 'al')).rejects.toThrow('docker unavailable');
    expect(removeSessionWorktrees).toHaveBeenCalledOnce();

    const [taskRow] = await (db as never as import('drizzle-orm/node-postgres').NodePgDatabase<typeof import('../db/schema')>)
      .select().from(sessions).orderBy(sessions.createdAt);
    expect(taskRow!.status).toBe(SessionStatus.FAILED);

    const allEvents = await eventStore.readSince(taskRow!.id, 0);
    const statusEvent = allEvents.find((e) => e.type === EventType.STATUS);
    expect((statusEvent!.payload as { status: string }).status).toBe(SessionStatus.FAILED);
  });

  it('archives a session by stamping archivedAt without removing the row', async () => {
    const { db } = await makeTestApp();
    const service = buildService({
      db,
      spawner: { spawn: vi.fn(async () => ({ containerId: 'c1' })), retire: vi.fn() },
      volume: fakeVolume(),
    });

    const task = await service.create({}, 'al');
    expect(task.archivedAt).toBeNull();

    await service.archive(task.id);

    const archived = await service.get(task.id);
    expect(archived?.archivedAt).not.toBeNull();
  });

  it('removes a session and its dependent rows', async () => {
    const removeSessionWorktrees = vi.fn(async () => undefined);
    const retire = vi.fn(async () => undefined);
    const { db } = await makeTestApp();
    const eventStore = (await import('../events/event-store')).createEventStore(db as never);
    const service = buildService({
      db,
      eventStore,
      eventBus: (await import('../events/event-bus')).createEventBus(),
      spawner: { spawn: vi.fn(async () => ({ containerId: 'c1' })), retire },
      volume: fakeVolume({ removeSessionWorktrees }),
    });

    const task = await service.create({}, 'al');
    await eventStore.append(task.id, [{ type: EventType.LOG, payload: { line: 'hi' } }]);

    await service.remove(task.id);

    expect(await service.get(task.id)).toBeNull();
    expect(await eventStore.readSince(task.id, 0)).toHaveLength(0);
    expect(removeSessionWorktrees).toHaveBeenCalledWith(task.id);
    expect(retire).toHaveBeenCalledWith('c1');
  });

  it('DELETE /api/tasks/:id removes an owned session when deletion is allowed (default)', async () => {
    const { app, db } = await makeTestApp();
    const cookie = (
      await app.inject({ method: 'POST', url: '/api/login', payload: { displayName: 'alice', password: 'pw' } })
    ).cookies[0];
    const headers = { cookie: `${cookie!.name}=${cookie!.value}` };
    const [row] = await db
      .insert(sessions)
      .values({ kind: 'headless', status: SessionStatus.DONE, createdBy: 'alice', archivedAt: new Date() })
      .returning();

    const res = await app.inject({ method: 'DELETE', url: `/api/tasks/${row!.id}`, headers });

    expect(res.statusCode).toBe(200);
    expect(await db.select().from(sessions).where(eq(sessions.id, row!.id))).toHaveLength(0);
  });

  it('DELETE /api/tasks/:id returns 403 and keeps the row when ALLOW_SESSION_DELETION=false', async () => {
    // Same env makeTestApp uses, with deletion switched off — the audit-retention deployment.
    const config = loadConfig({
      DATABASE_URL: 'postgres://x', APP_PASSWORD: 'pw', SESSION_SECRET: 'sec',
      SECRETS_KEY: '0123456789abcdef0123456789abcdef', WORKER_IMAGE: 'w',
      CONTROL_PLANE_URL: 'http://c', ALLOW_SESSION_DELETION: 'false',
    });
    const { app, db } = await makeTestApp({ config });
    const cookie = (
      await app.inject({ method: 'POST', url: '/api/login', payload: { displayName: 'alice', password: 'pw' } })
    ).cookies[0];
    const headers = { cookie: `${cookie!.name}=${cookie!.value}` };
    const [row] = await db
      .insert(sessions)
      .values({ kind: 'headless', status: SessionStatus.DONE, createdBy: 'alice', archivedAt: new Date() })
      .returning();

    const res = await app.inject({ method: 'DELETE', url: `/api/tasks/${row!.id}`, headers });

    expect(res.statusCode).toBe(403);
    // The archived row survives — that retention is the point of the flag.
    expect(await db.select().from(sessions).where(eq(sessions.id, row!.id))).toHaveLength(1);
  });

  it('POST /api/tasks returns 201 with createdBy and status=running', async () => {
    const { app } = await makeTestApp();
    const cookie = (
      await app.inject({ method: 'POST', url: '/api/login', payload: { displayName: 'alice', password: 'pw' } })
    ).cookies[0];
    const headers = { cookie: `${cookie!.name}=${cookie!.value}` };

    const res = await app.inject({ method: 'POST', url: '/api/tasks', headers, payload: {} });

    expect(res.statusCode).toBe(201);
    const task = res.json();
    expect(task.createdBy).toBe('alice');
    expect(task.status).toBe(SessionStatus.RUNNING);
  });

  it('explicit workerImage in request wins and is persisted on the task', async () => {
    const spawnCalls: import('../tasks/worker-spawner').SpawnInput[] = [];
    const capturingSpawner = {
      spawn: async (i: import('../tasks/worker-spawner').SpawnInput) => { spawnCalls.push(i); return { containerId: 'cap-c1' }; },
      retire: async () => {},
    };
    const { app } = await makeTestApp({}, { spawner: capturingSpawner });
    const cookie = (
      await app.inject({ method: 'POST', url: '/api/login', payload: { displayName: 'alice', password: 'pw' } })
    ).cookies[0];
    const headers = { cookie: `${cookie!.name}=${cookie!.value}` };

    const res = await app.inject({ method: 'POST', url: '/api/tasks', headers, payload: { workerImage: 'w' } });

    expect(res.statusCode).toBe(201);
    const task = res.json();
    expect(task.workerImage).toBe('w');
    expect(spawnCalls[0]?.workerImage).toBe('w');
  });

  it('uses stored default worker when no workerImage in request', async () => {
    const spawnCalls: import('../tasks/worker-spawner').SpawnInput[] = [];
    const capturingSpawner = {
      spawn: async (i: import('../tasks/worker-spawner').SpawnInput) => { spawnCalls.push(i); return { containerId: 'cap-c2' }; },
      retire: async () => {},
    };
    // Registry with TWO images so the stored default ('w2') is distinct from config fallback ('w')
    const { app } = await makeTestApp({
      workerRegistry: fakeWorkerRegistry({
        list: async () => [
          { id: 'w', image: 'w', name: 'W', description: '' },
          { id: 'w2', image: 'w2', name: 'W2', description: '' },
        ],
      }),
    }, { spawner: capturingSpawner });
    const cookie = (
      await app.inject({ method: 'POST', url: '/api/login', payload: { displayName: 'alice', password: 'pw' } })
    ).cookies[0];
    const headers = { cookie: `${cookie!.name}=${cookie!.value}` };

    // Seed the stored default to 'w2' — distinct from config WORKER_IMAGE='w'
    await app.inject({ method: 'PUT', url: '/api/settings/default-worker', headers, payload: { image: 'w2' } });

    const res = await app.inject({ method: 'POST', url: '/api/tasks', headers, payload: {} });

    expect(res.statusCode).toBe(201);
    expect(spawnCalls[0]?.workerImage).toBe('w2');
    expect(res.json().workerImage).toBe('w2');
  });

  it('falls back to config workerImage when no request or stored default', async () => {
    const spawnCalls: import('../tasks/worker-spawner').SpawnInput[] = [];
    const capturingSpawner = {
      spawn: async (i: import('../tasks/worker-spawner').SpawnInput) => { spawnCalls.push(i); return { containerId: 'cap-c3' }; },
      retire: async () => {},
    };
    const { app } = await makeTestApp({}, { spawner: capturingSpawner });
    const cookie = (
      await app.inject({ method: 'POST', url: '/api/login', payload: { displayName: 'alice', password: 'pw' } })
    ).cookies[0];
    const headers = { cookie: `${cookie!.name}=${cookie!.value}` };

    const res = await app.inject({ method: 'POST', url: '/api/tasks', headers, payload: {} });

    expect(res.statusCode).toBe(201);
    // config WORKER_IMAGE='w' is the fallback in makeTestApp
    expect(spawnCalls[0]?.workerImage).toBe('w');
    expect(res.json().workerImage).toBe('w');
  });

  it('rejects an unknown workerImage and does not call spawn', async () => {
    const spawnCalls: import('../tasks/worker-spawner').SpawnInput[] = [];
    const capturingSpawner = {
      spawn: async (i: import('../tasks/worker-spawner').SpawnInput) => { spawnCalls.push(i); return { containerId: 'cap-c4' }; },
      retire: async () => {},
    };
    const { app, db } = await makeTestApp({}, { spawner: capturingSpawner });
    const cookie = (
      await app.inject({ method: 'POST', url: '/api/login', payload: { displayName: 'alice', password: 'pw' } })
    ).cookies[0];
    const headers = { cookie: `${cookie!.name}=${cookie!.value}` };

    const res = await app.inject({ method: 'POST', url: '/api/tasks', headers, payload: { workerImage: 'evil:latest' } });

    // create() throws → Fastify surfaces as 500
    expect(res.statusCode).toBe(500);
    expect(spawnCalls).toHaveLength(0);

    // The row is still persisted as FAILED so the failed attempt is visible in the
    // session list — the symptom that made scheduled runs vanish silently.
    const [taskRow] = await (db as never as import('drizzle-orm/node-postgres').NodePgDatabase<typeof import('../db/schema')>)
      .select().from(sessions).orderBy(sessions.createdAt);
    expect(taskRow!.status).toBe(SessionStatus.FAILED);
    expect(taskRow!.workerImage).toBe('evil:latest');
  });

  it('listGraph returns every session including workflow parents and steps', async () => {
    const { db } = await makeTestApp();
    const service = buildService({ db, spawner: { spawn: vi.fn(), retire: vi.fn() }, volume: fakeVolume() });
    const [standalone] = await db.insert(sessions).values({ kind: 'headless', createdBy: 'al' }).returning();
    const [parent] = await db.insert(sessions).values({ kind: 'workflow', createdBy: 'al' }).returning();
    const [step] = await db
      .insert(sessions)
      .values({ kind: 'workflow_step', createdBy: 'al', parentSessionId: parent!.id, workflowStepKey: 'plan' })
      .returning();

    const all = await service.listGraph();

    expect(all.map((s) => s.id).sort()).toEqual([standalone!.id, parent!.id, step!.id].sort());
  });

  it('GET /api/tasks/graph returns sessions for every user, not just the requester', async () => {
    const { app } = await makeTestApp();
    const login = async (displayName: string) => {
      const c = (await app.inject({ method: 'POST', url: '/api/login', payload: { displayName, password: 'pw' } })).cookies[0];
      return { cookie: `${c!.name}=${c!.value}` };
    };
    const alice = await login('alice');
    await app.inject({ method: 'POST', url: '/api/tasks', headers: alice, payload: {} });
    const bob = await login('bob');

    const res = await app.inject({ method: 'GET', url: '/api/tasks/graph', headers: bob });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });

  it('forbids a non-owner from reading or mutating another user’s session (403)', async () => {
    const { app } = await makeTestApp();
    const login = async (displayName: string) => {
      const c = (await app.inject({ method: 'POST', url: '/api/login', payload: { displayName, password: 'pw' } })).cookies[0];
      return { cookie: `${c!.name}=${c!.value}` };
    };
    const alice = await login('alice');
    const created = (await app.inject({ method: 'POST', url: '/api/tasks', headers: alice, payload: {} })).json();

    const bob = await login('bob');
    expect((await app.inject({ method: 'GET', url: `/api/tasks/${created.id}`, headers: bob })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/api/tasks/${created.id}/stop`, headers: bob })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/api/tasks/${created.id}`, headers: bob })).statusCode).toBe(403);
    expect(
      (await app.inject({ method: 'POST', url: `/api/tasks/${created.id}/messages`, headers: bob, payload: { body: 'hi' } })).statusCode,
    ).toBe(403);

    // The owner still has access.
    expect((await app.inject({ method: 'GET', url: `/api/tasks/${created.id}`, headers: alice })).statusCode).toBe(200);
  });
});
