import { EventType, TaskStatus } from '@sagewright/shared';
import { describe, expect, it, vi } from 'vitest';

import { scheduledPrompts, tasks } from '../db/schema';
import { fakeVolume, fakeWorkerRegistry, makeTestApp } from '../test/make-test-app';
import { createTaskService } from './task-service';

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

describe('task routes', () => {
  it('creates an interactive session and spawns a worker', async () => {
    const spawn = vi.fn(async () => ({ containerId: 'c1' }));
    const addSessionWorktrees = vi.fn(async () => []);
    const { db } = await makeTestApp();

    const service = createTaskService({
      db: db as never,
      eventStore: { append: vi.fn(async () => []), readSince: vi.fn() } as never,
      eventBus: { publish: vi.fn(), subscribe: vi.fn() } as never,
      spawner: { spawn, retire: vi.fn() } as never,
      volume: fakeVolume({ addSessionWorktrees }),
      config: {} as never,
      userEnvService: { get: async () => '' } as never,
      githubCredentialService: fakeGithubCredentialService() as never,
      agentRunner: { run: vi.fn(async () => {}) } as never,
      userSettingsService: fakeUserSettingsService() as never,
      workerRegistry: fakeWorkerRegistry(),
    });

    const task = await service.create({}, 'al');
    expect(task.status).toBe(TaskStatus.RUNNING);
    expect(task.mode).toBe('interactive');
    expect(task.prompt).toBeNull();
    expect(addSessionWorktrees).toHaveBeenCalledOnce();
    expect(spawn).toHaveBeenCalledOnce();
  });

  it('uses the resolved GitHub credential for worktrees and worker env', async () => {
    const spawn = vi.fn(async () => ({ containerId: 'c1' }));
    const addSessionWorktrees = vi.fn(async () => []);
    const { db } = await makeTestApp();

    const service = createTaskService({
      db: db as never,
      eventStore: { append: vi.fn(async () => []), readSince: vi.fn() } as never,
      eventBus: { publish: vi.fn(), subscribe: vi.fn() } as never,
      spawner: { spawn, retire: vi.fn() } as never,
      volume: fakeVolume({ addSessionWorktrees }),
      config: {} as never,
      userEnvService: { get: async () => 'GITHUB_TOKEN=legacy\nOTHER=ok' } as never,
      githubCredentialService: fakeGithubCredentialService('resolved-token') as never,
      agentRunner: { run: vi.fn(async () => {}) } as never,
      userSettingsService: fakeUserSettingsService() as never,
      workerRegistry: fakeWorkerRegistry(),
    });

    await service.create({}, 'al');

    expect(addSessionWorktrees).toHaveBeenCalledWith(expect.any(String), [], 'resolved-token');
    expect(spawn.mock.calls[0][0].userEnv).toMatchObject({ GITHUB_TOKEN: 'resolved-token', OTHER: 'ok' });
  });

  it('creates a headless task from the scheduler with a prompt', async () => {
    const spawn = vi.fn(async () => ({ containerId: 'c1' }));
    const { db } = await makeTestApp();
    const [sp] = await (db as never as { insert: (t: unknown) => never })
      .insert(scheduledPrompts)
      .values({ cron: '0 9 * * *', prompt: 'nightly', createdBy: 'scheduler' })
      .returning();
    const service = createTaskService({
      db: db as never,
      eventStore: { append: vi.fn(async () => []), readSince: vi.fn() } as never,
      eventBus: { publish: vi.fn(), subscribe: vi.fn() } as never,
      spawner: { spawn, retire: vi.fn() } as never,
      volume: fakeVolume(),
      config: {} as never,
      userEnvService: { get: async () => '' } as never,
      githubCredentialService: fakeGithubCredentialService() as never,
      agentRunner: { run: vi.fn(async () => {}) } as never,
      userSettingsService: fakeUserSettingsService() as never,
      workerRegistry: fakeWorkerRegistry(),
    });

    const task = await service.create({ prompt: 'nightly' }, 'scheduler', { mode: 'headless', scheduledPromptId: sp.id });
    expect(task.mode).toBe('headless');
    expect(task.prompt).toBe('nightly');
    expect(task.scheduledPromptId).toBe(sp.id);
    expect(spawn.mock.calls[0][0]).toMatchObject({ mode: 'headless', prompt: 'nightly' });
  });

  it('tears down worktrees and fails the task on spawn error', async () => {
    const spawnError = new Error('docker unavailable');
    const removeSessionWorktrees = vi.fn(async () => undefined);
    const { db } = await makeTestApp();

    const eventStore = (await import('../events/event-store')).createEventStore(db as never);
    const eventBus = (await import('../events/event-bus')).createEventBus();

    const service = createTaskService({
      db: db as never,
      eventStore,
      eventBus,
      spawner: { spawn: vi.fn(async () => { throw spawnError; }), retire: vi.fn() } as never,
      volume: fakeVolume({ removeSessionWorktrees }),
      config: {} as never,
      userEnvService: { get: async () => '' } as never,
      githubCredentialService: fakeGithubCredentialService() as never,
      agentRunner: { run: vi.fn(async () => {}) } as never,
      userSettingsService: fakeUserSettingsService() as never,
      workerRegistry: fakeWorkerRegistry(),
    });

    await expect(service.create({}, 'al')).rejects.toThrow('docker unavailable');
    expect(removeSessionWorktrees).toHaveBeenCalledOnce();

    const [taskRow] = await (db as never as import('drizzle-orm/node-postgres').NodePgDatabase<typeof import('../db/schema')>)
      .select().from(tasks).orderBy(tasks.createdAt);
    expect(taskRow.status).toBe(TaskStatus.FAILED);

    const allEvents = await eventStore.readSince(taskRow.id, 0);
    const statusEvent = allEvents.find((e) => e.type === EventType.STATUS);
    expect((statusEvent!.payload as { status: string }).status).toBe(TaskStatus.FAILED);
  });

  it('archives a session by stamping archivedAt without removing the row', async () => {
    const { db } = await makeTestApp();
    const service = createTaskService({
      db: db as never,
      eventStore: { append: vi.fn(async () => []), readSince: vi.fn() } as never,
      eventBus: { publish: vi.fn(), subscribe: vi.fn() } as never,
      spawner: { spawn: vi.fn(async () => ({ containerId: 'c1' })), retire: vi.fn() } as never,
      volume: fakeVolume(),
      config: {} as never,
      userEnvService: { get: async () => '' } as never,
      githubCredentialService: fakeGithubCredentialService() as never,
      agentRunner: { run: vi.fn(async () => {}) } as never,
      userSettingsService: fakeUserSettingsService() as never,
      workerRegistry: fakeWorkerRegistry(),
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
    const service = createTaskService({
      db: db as never,
      eventStore,
      eventBus: (await import('../events/event-bus')).createEventBus(),
      spawner: { spawn: vi.fn(async () => ({ containerId: 'c1' })), retire } as never,
      volume: fakeVolume({ removeSessionWorktrees }),
      config: {} as never,
      userEnvService: { get: async () => '' } as never,
      githubCredentialService: fakeGithubCredentialService() as never,
      agentRunner: { run: vi.fn(async () => {}) } as never,
      userSettingsService: fakeUserSettingsService() as never,
      workerRegistry: fakeWorkerRegistry(),
    });

    const task = await service.create({}, 'al');
    await eventStore.append(task.id, [{ type: EventType.LOG, payload: { line: 'hi' } }]);

    await service.remove(task.id);

    expect(await service.get(task.id)).toBeNull();
    expect(await eventStore.readSince(task.id, 0)).toHaveLength(0);
    expect(removeSessionWorktrees).toHaveBeenCalledWith(task.id);
    expect(retire).toHaveBeenCalledWith('c1');
  });

  it('POST /api/tasks returns 201 with createdBy and status=running', async () => {
    const { app } = await makeTestApp();
    const cookie = (
      await app.inject({ method: 'POST', url: '/api/login', payload: { displayName: 'alice', password: 'pw' } })
    ).cookies[0];
    const headers = { cookie: `${cookie.name}=${cookie.value}` };

    const res = await app.inject({ method: 'POST', url: '/api/tasks', headers, payload: {} });

    expect(res.statusCode).toBe(201);
    const task = res.json();
    expect(task.createdBy).toBe('alice');
    expect(task.status).toBe(TaskStatus.RUNNING);
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
    const headers = { cookie: `${cookie.name}=${cookie.value}` };

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
    const headers = { cookie: `${cookie.name}=${cookie.value}` };

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
    const headers = { cookie: `${cookie.name}=${cookie.value}` };

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
    const headers = { cookie: `${cookie.name}=${cookie.value}` };

    const res = await app.inject({ method: 'POST', url: '/api/tasks', headers, payload: { workerImage: 'evil:latest' } });

    // create() throws → Fastify surfaces as 500
    expect(res.statusCode).toBe(500);
    expect(spawnCalls).toHaveLength(0);

    // The row is still persisted as FAILED so the failed attempt is visible in the
    // session list — the symptom that made scheduled runs vanish silently.
    const [taskRow] = await (db as never as import('drizzle-orm/node-postgres').NodePgDatabase<typeof import('../db/schema')>)
      .select().from(tasks).orderBy(tasks.createdAt);
    expect(taskRow.status).toBe(TaskStatus.FAILED);
    expect(taskRow.workerImage).toBe('evil:latest');
  });
});
