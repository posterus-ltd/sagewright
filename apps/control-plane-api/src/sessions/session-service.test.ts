import { randomUUID } from 'node:crypto';

import { EventType, SessionKind, SessionStatus } from '@sagewright/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { loadConfig } from '../config';
import { events, repos, sessions } from '../db/schema';
import type { SpawnInput } from '../tasks/worker-spawner';
import { createEventBus } from '../events/event-bus';
import { createEventStore } from '../events/event-store';
import { fakeVolume, fakeWorkerRegistry, makeTestApp } from '../test/make-test-app';
import { createSessionService } from './session-service';

const config = loadConfig({
  DATABASE_URL: 'postgres://x',
  APP_PASSWORD: 'pw',
  SESSION_SECRET: 'sec',
  SECRETS_KEY: '0123456789abcdef0123456789abcdef',
  WORKER_IMAGE: 'w',
  CONTROL_PLANE_URL: 'http://c',
});

interface SetupOpts {
  envBlob?: string;
  credential?: { token: string; login: string; name: string | null; email: string };
  spawn?: (i: SpawnInput) => Promise<{ containerId: string }>;
  defaultWorker?: string | null;
  volume?: Partial<ReturnType<typeof fakeVolume>>;
}

const setup = async (opts: SetupOpts = {}) => {
  const { db } = await makeTestApp();
  const eventStore = createEventStore(db as never);
  const eventBus = createEventBus();

  const spawns: SpawnInput[] = [];
  const retire = vi.fn(async () => undefined);
  const doSpawn = opts.spawn ?? (async () => ({ containerId: 'cid' }));
  const spawner = {
    spawn: async (i: SpawnInput) => {
      spawns.push(i);
      return doSpawn(i);
    },
    retire,
  };

  const removeSessionWorktrees = vi.fn(async () => undefined);
  const service = createSessionService({
    db: db as never,
    eventStore,
    eventBus,
    spawner,
    volume: fakeVolume({ removeSessionWorktrees, ...opts.volume }),
    config,
    userEnvService: { get: async () => opts.envBlob ?? '' } as never,
    githubCredentialService: { resolve: async () => opts.credential } as never,
    userSettingsService: { getDefaultWorker: async () => opts.defaultWorker ?? null } as never,
    workerRegistry: fakeWorkerRegistry(),
  });

  return { db, service, spawns, removeSessionWorktrees, retire: spawner.retire };
};

const eventsFor = async (db: Awaited<ReturnType<typeof makeTestApp>>['db'], id: string) => {
  const rows = await db
    .select()
    .from(events)
    .where(eq(events.sessionId, id));
  return rows as (typeof events.$inferSelect)[];
};

describe('session-service spawnSession', () => {
  it('injects GITHUB_TOKEN and strips reserved env keys before spawning', async () => {
    const { service, spawns } = await setup({
      envBlob: 'FOO=bar\nWORKER_TOKEN=leak\n',
      credential: { token: 'ght', login: 'u', name: 'u', email: 'e' },
    });

    await service.spawnSession({ kind: SessionKind.HEADLESS, createdBy: 'al', prompt: 'do it' });

    expect(spawns).toHaveLength(1);
    expect(spawns[0]!.userEnv.FOO).toBe('bar');
    expect(spawns[0]!.userEnv.WORKER_TOKEN).toBeUndefined();
    expect(spawns[0]!.userEnv.GITHUB_TOKEN).toBe('ght');
  });

  it('persists the container id on the session row and returns it', async () => {
    const { db, service } = await setup();

    const result = await service.spawnSession({ kind: SessionKind.INTERACTIVE, createdBy: 'al' });

    expect(result.containerId).toBe('cid');
    const [row] = await db.select().from(sessions).where(eq(sessions.id, result.id)).limit(1);
    expect(row!.containerId).toBe('cid');
    expect(row!.branch).toBe(`task/${result.id}`);
  });

  it('stamps FAILED and emits ERROR+STATUS when the spawner throws', async () => {
    const { db, service, removeSessionWorktrees } = await setup({
      spawn: async () => {
        throw new Error('boom');
      },
    });

    await expect(service.spawnSession({ kind: SessionKind.HEADLESS, createdBy: 'al' })).rejects.toThrow('boom');

    const [row] = await db.select().from(sessions).orderBy(sessions.createdAt).limit(1);
    expect(row!.status).toBe(SessionStatus.FAILED);
    expect(removeSessionWorktrees).toHaveBeenCalledWith(row!.id);

    const evs = await eventsFor(db, row!.id);
    expect(evs.some((e) => e.type === EventType.ERROR)).toBe(true);
    expect(
      evs.some((e) => e.type === EventType.STATUS && (e.payload as { status?: string }).status === SessionStatus.FAILED),
    ).toBe(true);
  });

  it('retires the late container and preserves STOPPED when stop lands mid-provisioning', async () => {
    let dbRef: Awaited<ReturnType<typeof setup>>['db'] | null = null;
    const { db, service, retire } = await setup({
      spawn: async (i) => {
        // The user stops the session while docker create is still in flight.
        await dbRef!.update(sessions).set({ status: SessionStatus.STOPPED }).where(eq(sessions.id, i.taskId));
        return { containerId: 'late-cid' };
      },
    });
    dbRef = db;

    await expect(service.spawnSession({ kind: SessionKind.INTERACTIVE, createdBy: 'al' })).rejects.toThrow(
      /settled during provisioning/,
    );

    // The just-spawned box must be retired, not adopted — a terminal row is skipped
    // by the boot reconciler, so an adopted container would leak forever.
    expect(retire).toHaveBeenCalledWith('late-cid');
    const [row] = await db.select().from(sessions).orderBy(sessions.createdAt).limit(1);
    expect(row!.status).toBe(SessionStatus.STOPPED); // the user's stop wins — never FAILED
    expect(row!.containerId).toBeNull();
    const evs = await eventsFor(db, row!.id);
    expect(
      evs.some((e) => e.type === EventType.STATUS && (e.payload as { status?: string }).status === SessionStatus.FAILED),
    ).toBe(false);
  });

  it('rejects an unknown worker image with a FAILED session', async () => {
    const { db, service } = await setup();

    await expect(
      service.spawnSession({ kind: SessionKind.HEADLESS, createdBy: 'al', workerImage: 'not-registered' }),
    ).rejects.toThrow(/unknown worker image/);

    const [row] = await db.select().from(sessions).orderBy(sessions.createdAt).limit(1);
    expect(row!.status).toBe(SessionStatus.FAILED);
  });

  it('hydrateSession rebuilds runtime input for a detached interactive session', async () => {
    const listSessionWorktrees = vi.fn(async () => ['a-b']);
    const { db, service } = await setup({
      credential: { token: 'ght', login: 'u', name: null, email: 'e' },
      volume: { listSessionWorktrees },
    });
    const [row] = await db
      .insert(sessions)
      .values({ kind: 'interactive', status: SessionStatus.DETACHED, createdBy: 'al', containerId: 'c9' })
      .returning();
    await db.insert(repos).values({ userKey: 'al', url: 'https://github.com/a/b', slug: 'a-b', defaultBranch: 'main' });

    const input = await service.hydrateSession(row!.id);

    expect(input).not.toBeNull();
    expect(input!.sessionId).toBe(row!.id);
    expect(input!.containerId).toBe('c9');
    expect(input!.sessionDir).toContain(row!.id);
    expect(input!.manifest).toEqual([
      {
        slug: 'a-b',
        url: 'https://github.com/a/b',
        defaultBranch: 'main',
        path: expect.stringContaining(`${row!.id}/a-b`),
      },
    ]);
    expect(input!.githubIdentity).toMatchObject({ login: 'u' });
  });

  it('hydrateSession returns null for terminal, non-interactive, or container-less sessions', async () => {
    const { db, service } = await setup();
    const mk = async (v: Partial<typeof sessions.$inferInsert>): Promise<string> => {
      const [r] = await db
        .insert(sessions)
        .values({ kind: 'interactive', status: SessionStatus.DETACHED, createdBy: 'al', containerId: 'c', ...v })
        .returning();
      return r!.id;
    };

    expect(await service.hydrateSession(await mk({ status: SessionStatus.STOPPED }))).toBeNull();
    expect(await service.hydrateSession(await mk({ kind: 'headless' }))).toBeNull();
    expect(await service.hydrateSession(await mk({ containerId: null }))).toBeNull();
    expect(await service.hydrateSession(randomUUID())).toBeNull();
  });

  it('reuses provided worktrees instead of creating per-session ones (workflow step path)', async () => {
    const addSessionWorktrees = vi.fn(async () => []);
    const { service, spawns } = await setup({ volume: { addSessionWorktrees } });
    const manifest = [{ slug: 'a-b', url: 'u', defaultBranch: 'main', path: '/v/a-b' }];
    const runId = randomUUID();

    await service.spawnSession({
      kind: SessionKind.WORKFLOW_STEP,
      createdBy: 'al',
      prompt: 'step',
      workflowStepKey: 'plan',
      iteration: 0,
      branch: `workflow/${runId}`,
      worktrees: { sessionDir: `/v/${runId}`, manifest },
    });

    expect(addSessionWorktrees).not.toHaveBeenCalled();
    expect(spawns[0]!.sessionDir).toBe(`/v/${runId}`);
    expect(spawns[0]!.manifest).toEqual(manifest);
  });
});
