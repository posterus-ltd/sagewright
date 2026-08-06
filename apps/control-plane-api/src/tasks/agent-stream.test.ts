import { SessionStatus } from '@sagewright/shared';
import { PassThrough } from 'node:stream';
import { and, eq, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { createEventBus } from '../events/event-bus';
import { createEventStore } from '../events/event-store';
import { inboundMessages, sessions } from '../db/schema';
import { makeTestApp } from '../test/make-test-app';
import { createAgentStreaming } from './agent-stream';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const until = async (cond: () => boolean, ms = 2500): Promise<void> => {
  const deadline = Date.now() + ms;
  while (!cond() && Date.now() < deadline) await tick();
};

const fakeExec = () => {
  const stream = new PassThrough();
  const writes: string[] = [];
  return {
    stream,
    writes,
    exec: {
      startAgent: async () => ({
        stream,
        write: (d: string) => {
          writes.push(d);
        },
        resize: async () => {},
        inspect: async () => ({ exitCode: 0, running: false }),
        close: () => stream.destroy(),
      }),
      capture: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    },
  };
};

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Wrap the db so `before()` runs just ahead of the FIRST inbound_messages
 *  update executing — simulating a message that lands between the poll's read
 *  of the pending set and its consume write. */
const withInsertBeforeConsume = (db: any, before: () => Promise<void>) => {
  let fired = false;
  const wrapBuilder = (builder: any): any =>
    new Proxy(builder, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop === 'then' && typeof value === 'function') {
          return (onFulfilled: any, onRejected: any) =>
            before().then(() => value.call(target, onFulfilled, onRejected));
        }
        if (typeof value === 'function') {
          return (...args: any[]) => wrapBuilder(value.apply(target, args));
        }
        return value;
      },
    });
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop !== 'update') return Reflect.get(target, prop, receiver);
      return (table: unknown) => {
        const builder = target.update(table);
        if (table !== inboundMessages || fired) return builder;
        fired = true;
        return wrapBuilder(builder);
      };
    },
  });
};
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('agent-stream interjections', () => {
  it('delivers every interjection it consumes — including one that lands mid-poll', { timeout: 10000 }, async () => {
    const { db, userId } = await makeTestApp();
    const [row] = await db
      .insert(sessions)
      .values({ kind: 'headless', status: SessionStatus.RUNNING, createdBy: userId('al') })
      .returning();
    const id = row!.id;
    const eventStore = createEventStore(db as never);
    const eventBus = createEventBus();
    const { stream, writes, exec } = fakeExec();

    const wrapped = withInsertBeforeConsume(db, async () => {
      await db.insert(inboundMessages).values({ sessionId: id, body: 'second' });
    });

    const streaming = createAgentStreaming({
      db: wrapped as never,
      eventStore,
      eventBus,
      exec: exec as never,
      pollMs: 25,
    });
    const { emit, drain } = streaming.createEmitter(id);
    const done = streaming.streamAgentSession(
      { taskId: id, containerId: 'c1', manifest: [], sessionDir: '/v' },
      emit,
      drain,
    );

    await until(() => stream.listenerCount('end') > 0);
    await db.insert(inboundMessages).values({ sessionId: id, body: 'first' });

    // Both messages must reach the PTY: 'first' was pending before the tick,
    // 'second' landed while that tick was consuming.
    await until(() => writes.length >= 2);
    stream.end();
    await done;

    expect(writes).toContain('first\n');
    expect(writes).toContain('second\n');
    // Exactly once each — nothing consumed-but-undelivered, nothing duplicated.
    expect(writes).toHaveLength(2);
    const pending = await db
      .select()
      .from(inboundMessages)
      .where(and(eq(inboundMessages.sessionId, id), isNull(inboundMessages.consumedAt)));
    expect(pending).toHaveLength(0);
  });
});
