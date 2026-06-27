import { EventType } from '@sagewright/shared';
import { describe, expect, it } from 'vitest';

import { assignSeqs } from './event-store';

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
    expect(out[0].seq).toBe(1);
  });
});
