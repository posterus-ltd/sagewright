import { EventType, SessionStatus } from '@sagewright/shared';
import { PassThrough } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { createEventBus } from '../events/event-bus';
import { createEventStore } from '../events/event-store';
import { sessions } from '../db/schema';
import { makeTestApp } from '../test/make-test-app';
import { createAgentDriver } from './agent-driver';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// Wait until run() has attached its stream listeners so we don't end before it's listening.
const waitListening = async (stream: PassThrough): Promise<void> => {
  for (let i = 0; i < 100 && stream.listenerCount('end') === 0; i += 1) await tick();
};

const insertTask = async (db: Awaited<ReturnType<typeof makeTestApp>>['db']): Promise<string> => {
  const [row] = await db
    .insert(sessions)
    .values({ kind: 'headless', status: SessionStatus.PROVISIONING, createdBy: randomUUID() })
    .returning();
  return row!.id;
};

const fakeExec = (exitCode: number) => {
  const stream = new PassThrough();
  return {
    stream,
    exec: {
      startAgent: async () => ({
        stream,
        write: vi.fn(),
        resize: async () => {},
        inspect: async () => ({ exitCode, running: false }),
        close: () => stream.destroy(),
      }),
      // No diff → git status returns empty so push/PR are skipped.
      capture: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    },
  };
};

describe('agent-driver', () => {
  it('streams output, finishes DONE, mirrors status, and retires the box', async () => {
    const { db } = await makeTestApp();
    const id = await insertTask(db as never);
    const eventStore = createEventStore(db as never);
    const eventBus = createEventBus();
    const { stream, exec } = fakeExec(0);
    const retire = vi.fn(async () => {});

    const driver = createAgentDriver({ db: db as never, eventStore, eventBus, exec: exec as never, retire });
    const done = driver.run({
      taskId: id,
      containerId: 'c1',
      manifest: [{ slug: 'a-b', url: 'u', defaultBranch: 'main', path: '/v/a-b' }],
      sessionDir: '/v',
    });

    await waitListening(stream);
    stream.write('working...\n');
    await tick();
    stream.end();
    await done;

    const evs = await eventStore.readSince(id, 0);
    const statuses = evs.filter((e) => e.type === EventType.STATUS).map((e) => e.payload['status']);
    expect(statuses).toEqual([SessionStatus.RUNNING, SessionStatus.PUSHING, SessionStatus.DONE]);
    expect(evs.some((e) => e.type === EventType.OUTPUT && e.payload['chunk'] === 'working...\n')).toBe(true);

    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);
    expect(row!.status).toBe(SessionStatus.DONE);
    expect(retire).toHaveBeenCalledWith('c1');
    // Lifecycle timestamps: stamped on first RUNNING and on the terminal settle.
    expect(row!.startedAt).not.toBeNull();
    expect(row!.endedAt).not.toBeNull();
  });

  it('marks the task FAILED on a non-zero exit code', async () => {
    const { db } = await makeTestApp();
    const id = await insertTask(db as never);
    const eventStore = createEventStore(db as never);
    const eventBus = createEventBus();
    const { stream, exec } = fakeExec(1);

    const driver = createAgentDriver({ db: db as never, eventStore, eventBus, exec: exec as never, retire: async () => {} });
    const done = driver.run({ taskId: id, containerId: 'c1', manifest: [], sessionDir: '/v' });

    await waitListening(stream);
    stream.end();
    await done;

    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);
    expect(row!.status).toBe(SessionStatus.FAILED);
  });

  it('runInteractive settles DETACHED on turn exit, hands over the live exec, and does NOT retire', async () => {
    const { db } = await makeTestApp();
    const id = await insertTask(db as never);
    const eventStore = createEventStore(db as never);
    const eventBus = createEventBus();
    const { stream, exec } = fakeExec(0);
    const retire = vi.fn(async () => {});

    const driver = createAgentDriver({ db: db as never, eventStore, eventBus, exec: exec as never, retire });
    let live: unknown = null;
    const fanned: Buffer[] = [];
    const done = driver.runInteractive(
      { taskId: id, containerId: 'c1', manifest: [], sessionDir: '/v' },
      { onSession: (s) => { live = s; }, onData: (b) => fanned.push(b) },
    );

    await waitListening(stream);
    stream.write('live output\n');
    await tick();
    stream.end();
    await done;

    const evs = await eventStore.readSince(id, 0);
    const statuses = evs.filter((e) => e.type === EventType.STATUS).map((e) => e.payload['status']);
    expect(statuses).toEqual([SessionStatus.RUNNING, SessionStatus.DETACHED]);
    // The turn's output was both persisted (OUTPUT) and teed live to the sink.
    expect(evs.some((e) => e.type === EventType.OUTPUT && e.payload['chunk'] === 'live output\n')).toBe(true);
    expect(Buffer.concat(fanned).toString()).toBe('live output\n');
    expect(live).not.toBeNull();
    expect(retire).not.toHaveBeenCalled();

    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);
    expect(row!.status).toBe(SessionStatus.DETACHED);
    // Detached is a resting state, not an end state: the run has started, not ended.
    expect(row!.startedAt).not.toBeNull();
    expect(row!.endedAt).toBeNull();
  });

  it('complete pushes changed repos, opens a PR, settles DONE, and retires', async () => {
    const { db } = await makeTestApp();
    const id = await insertTask(db as never);
    const eventStore = createEventStore(db as never);
    const eventBus = createEventBus();
    const retire = vi.fn(async () => {});
    const exec = {
      startAgent: async () => { throw new Error('unused'); },
      capture: async (_id: string, o: { cmd: string[] }) => {
        if (o.cmd[0] === 'git' && o.cmd[1] === 'status') return { exitCode: 0, stdout: ' M file\n', stderr: '' };
        if (o.cmd[0] === 'gh') return { exitCode: 0, stdout: 'https://gh/pr/1', stderr: '' };
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    };

    const driver = createAgentDriver({ db: db as never, eventStore, eventBus, exec: exec as never, retire });
    await driver.complete({
      taskId: id,
      containerId: 'c1',
      manifest: [{ slug: 'a-b', url: 'u', defaultBranch: 'main', path: '/v/a-b' }],
    });

    const evs = await eventStore.readSince(id, 0);
    const statuses = evs.filter((e) => e.type === EventType.STATUS).map((e) => e.payload['status']);
    expect(statuses).toEqual([SessionStatus.PUSHING, SessionStatus.DONE]);
    expect(evs.some((e) => e.type === EventType.PR_OPENED && e.payload['url'] === 'https://gh/pr/1')).toBe(true);
    expect(retire).toHaveBeenCalledWith('c1');
  });
});
