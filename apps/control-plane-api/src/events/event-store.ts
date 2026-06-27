import type { IngestEvent, StreamEvent } from '@sagewright/shared';
import { and, desc, eq, gt } from 'drizzle-orm';

import type { Db } from '../db/client';
import { events } from '../db/schema';

export const assignSeqs = (maxSeq: number, batch: IngestEvent[], createdAt: string): StreamEvent[] =>
  batch.map((e, i) => ({ seq: maxSeq + 1 + i, type: e.type, payload: e.payload, createdAt }));

export const createEventStore = (db: Db) => ({
  append: async (taskId: string, batch: IngestEvent[]): Promise<StreamEvent[]> => {
    return db.transaction(async (tx) => {
      const [last] = await tx.select({ seq: events.seq }).from(events)
        .where(eq(events.taskId, taskId)).orderBy(desc(events.seq)).limit(1);
      const assigned = assignSeqs(last?.seq ?? 0, batch, new Date().toISOString());
      if (assigned.length) {
        await tx.insert(events).values(assigned.map((e) => ({ taskId, seq: e.seq, type: e.type, payload: e.payload, createdAt: new Date(e.createdAt) })));
      }
      return assigned;
    });
  },
  readSince: async (taskId: string, afterSeq: number): Promise<StreamEvent[]> => {
    const rows = await db.select().from(events)
      .where(and(eq(events.taskId, taskId), gt(events.seq, afterSeq))).orderBy(events.seq);
    return rows.map((r) => ({ seq: r.seq, type: r.type as StreamEvent['type'], payload: r.payload as Record<string, unknown>, createdAt: r.createdAt.toISOString() }));
  },
});

export type EventStore = ReturnType<typeof createEventStore>;
