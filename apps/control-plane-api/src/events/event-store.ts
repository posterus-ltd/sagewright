import type { IngestEvent, StreamEvent } from '@sagewright/shared';
import { and, desc, eq, gt } from 'drizzle-orm';
import type { Pool } from 'pg';
import QueryStream from 'pg-query-stream';

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

// Prefetch window for the replay cursor: how many rows pg-query-stream buffers ahead.
// Bounds per-stream memory to a fixed batch regardless of how large the transcript is.
const REPLAY_BATCH = 200;

// A single row shape from the raw replay cursor. `seq` comes back as a string (pg parses
// int8 as text unless a type parser is registered) and `payload` is already a parsed object
// (jsonb has a built-in parser), so this is exactly what streamSince maps from.
interface EventRow {
  seq: string | number;
  type: string;
  payload: Record<string, unknown>;
  created_at: Date;
}

export const createEventStore = (db: Db, pool?: Pool) => {
  // One serialized append chain per session so the read-max-then-insert can't
  // interleave with itself in-process. The unique index is the cross-process backstop.
  const locks = new Map<string, Promise<unknown>>();
  const runExclusive = <T>(sessionId: string, fn: () => Promise<T>): Promise<T> => {
    const prev = locks.get(sessionId) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.then(() => undefined, () => undefined);
    locks.set(sessionId, tail);
    // Evict the entry once it settles, but only if nothing newer chained on after it —
    // otherwise the map grows one never-removed entry per session id for the process life.
    void tail.then(() => {
      if (locks.get(sessionId) === tail) locks.delete(sessionId);
    });
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

  // Buffer the whole tail into memory. Fine for small reads (tests, short transcripts) and
  // the fallback when no pool is available for cursor streaming — but NOT what the SSE route
  // uses for its initial replay: see streamSince.
  const readSince = async (sessionId: string, afterSeq: number): Promise<StreamEvent[]> => {
    const rows = await db.select().from(events)
      .where(and(eq(events.sessionId, sessionId), gt(events.seq, afterSeq))).orderBy(events.seq);
    return rows.map((r) => ({ seq: r.seq, type: r.type as StreamEvent['type'], payload: r.payload as Record<string, unknown>, createdAt: r.createdAt.toISOString() }));
  };

  // Stream the tail row-by-row through a server-side cursor so a large transcript never
  // sits in the heap all at once. The canvas opens one replay per widget, so buffering the
  // full transcript per session (readSince) let a screenful of long sessions exhaust the
  // Node heap and crash the control plane; the cursor keeps each replay at ~REPLAY_BATCH
  // rows. Without a pool (unit tests run on pg-mem, which has no cursor support) it falls
  // back to a buffered read — correct and cheap for those small datasets.
  const streamSince = (sessionId: string, afterSeq: number): AsyncIterable<StreamEvent> => ({
    async *[Symbol.asyncIterator]() {
      if (!pool) {
        for (const e of await readSince(sessionId, afterSeq)) yield e;
        return;
      }
      const client = await pool.connect();
      try {
        const query = new QueryStream(
          'SELECT seq, type, payload, created_at FROM events WHERE session_id = $1 AND seq > $2 ORDER BY seq',
          [sessionId, afterSeq],
          { batchSize: REPLAY_BATCH },
        );
        const cursor = client.query(query) as unknown as AsyncIterable<EventRow>;
        for await (const r of cursor) {
          yield { seq: Number(r.seq), type: r.type as StreamEvent['type'], payload: r.payload, createdAt: r.created_at.toISOString() };
        }
      } finally {
        // Return the connection to the pool. If the consumer stopped early (client
        // disconnect), aborting the for-await already destroyed the cursor, so the client
        // is idle and safe to reuse.
        client.release();
      }
    },
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
    readSince,
    streamSince,
  };
};

export type EventStore = ReturnType<typeof createEventStore>;
