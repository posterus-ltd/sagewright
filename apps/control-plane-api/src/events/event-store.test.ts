import { EventType } from '@sagewright/shared';
import { describe, expect, it } from 'vitest';

import { sessions } from '../db/schema';
import { makeTestApp } from '../test/make-test-app';
import { assignSeqs, createEventStore } from './event-store';

describe('assignSeqs', () => {
  it('assigns monotonic seqs starting after the current max', () => {
    const out = assignSeqs(5, [
      { type: EventType.LOG, payload: {} },
      { type: EventType.ASSISTANT, payload: { text: 'hi' } },
    ], 'now');
    expect(out.map((e) => e.seq)).toEqual([6, 7]);
  });

  it('assigns seq === 1 for the first event (maxSeq 0)', () => {
    const out = assignSeqs(0, [{ type: EventType.LOG, payload: {} }], 'now');
    expect(out[0]!.seq).toBe(1);
  });
});

describe('createEventStore append serialization', () => {
  it('gives concurrent appends to one session contiguous, collision-free seqs', async () => {
    const { db, userId } = await makeTestApp();
    const [s] = await db
      .insert(sessions)
      .values({ kind: 'headless', createdBy: userId('al') })
      .returning();
    const store = createEventStore(db as never);

    // Fire 20 appends concurrently for the SAME session. Without the per-session
    // mutex these race the read-max-then-insert and collide on (session_id, seq).
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => store.append(s!.id, [{ type: EventType.LOG, payload: { i } }])),
    );

    const seqs = (await store.readSince(s!.id, 0)).map((e) => e.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
});
