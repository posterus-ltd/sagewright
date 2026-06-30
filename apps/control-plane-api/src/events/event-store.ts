import type { IngestEvent, StreamEvent } from '@sagewright/shared';
import { and, desc, eq, gt } from 'drizzle-orm';

import type { Db } from '../db/client';
import { events } from '../db/schema';

export const assignSeqs = (maxSeq: number, batch: IngestEvent[], createdAt: string): StreamEvent[] =>
  batch.map((e, i) => ({ seq: maxSeq + 1 + i, type: e.type, payload: e.payload, createdAt }));

// `seq` is assigned read-max-then-insert, so two concurrent appends could read the
// same max and collide on the unique (session_id, seq) index. The pg error code for
// a unique violation; we recompute the max and retry once when we hit it.
const UNIQUE_VIOLATION = '23505';
const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION;

export const createEventStore = (db: Db) => {
  // One serialized append chain per session so the read-max-then-insert can't
  // interleave with itself in-process. The unique index is the cross-process backstop.
  const locks = new Map<string, Promise<unknown>>();
  const runExclusive = <T>(sessionId: string, fn: () => Promise<T>): Promise<T> => {
    const prev = locks.get(sessionId) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    locks.set(sessionId, run.then(() => undefined, () => undefined));
    return run;
  };

  const appendOnce = (sessionId: string, batch: IngestEvent[]): Promise<StreamEvent[]> =>
    db.transaction(async (tx) => {
      const [last] = await tx.select({ seq: events.seq }).from(events)
        .where(eq(events.sessionId, sessionId)).orderBy(desc(events.seq)).limit(1);
      const assigned = assignSeqs(last?.seq ?? 0, batch, new Date().toISOString());
      if (assigned.length) {
        await tx.insert(events).values(assigned.map((e) => ({ sessionId, seq: e.seq, type: e.type, payload: e.payload, createdAt: new Date(e.createdAt) })));
      }
      return assigned;
    });

  return {
    append: (sessionId: string, batch: IngestEvent[]): Promise<StreamEvent[]> =>
      runExclusive(sessionId, async () => {
        try {
          return await appendOnce(sessionId, batch);
        } catch (err) {
          if (isUniqueViolation(err)) return appendOnce(sessionId, batch);
          throw err;
        }
      }),
    readSince: async (sessionId: string, afterSeq: number): Promise<StreamEvent[]> => {
      const rows = await db.select().from(events)
        .where(and(eq(events.sessionId, sessionId), gt(events.seq, afterSeq))).orderBy(events.seq);
      return rows.map((r) => ({ seq: r.seq, type: r.type as StreamEvent['type'], payload: r.payload as Record<string, unknown>, createdAt: r.createdAt.toISOString() }));
    },
  };
};

export type EventStore = ReturnType<typeof createEventStore>;
