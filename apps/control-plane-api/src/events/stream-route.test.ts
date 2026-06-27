import { EventType } from '@sagewright/shared';
import { describe, expect, it, vi } from 'vitest';

import { formatSseFrame, streamTaskEvents } from './stream-route';

describe('formatSseFrame', () => {
  it('formats an SSE frame with id, event, and data', () => {
    const frame = formatSseFrame({ seq: 3, type: EventType.LOG, payload: { line: 'hi' }, createdAt: 'now' });
    expect(frame).toBe('id: 3\nevent: log\ndata: {"line":"hi"}\n\n');
  });
});

describe('streamTaskEvents', () => {
  it('replays stored events then tails live events with dedupe by seq', async () => {
    const fakeEvents = [
      { seq: 2, type: EventType.LOG, payload: { line: 'dup' }, createdAt: 't2' },
      { seq: 3, type: EventType.LOG, payload: { line: 'new' }, createdAt: 't3' },
    ];
    let callCount = 0;
    const fakeIterator = {
      next: (): Promise<IteratorResult<(typeof fakeEvents)[number]>> => {
        const item = fakeEvents[callCount++];
        if (item) return Promise.resolve({ value: item, done: false as const });
        return Promise.resolve({ value: undefined as never, done: true as const });
      },
      return: (): Promise<IteratorResult<never>> =>
        Promise.resolve({ value: undefined as never, done: true as const }),
    };

    const write = vi.fn();

    await streamTaskEvents({
      iterator: fakeIterator,
      readSince: (_afterSeq) =>
        Promise.resolve([
          { seq: 1, type: EventType.LOG, payload: { line: 'a' }, createdAt: 't1' },
          { seq: 2, type: EventType.LOG, payload: { line: 'b' }, createdAt: 't2' },
        ]),
      lastEventId: 0,
      write,
    });

    // Expect exactly 3 writes: seq 1, 2 (from replay), 3 (from tail); seq 2 from iterator must be deduped
    expect(write).toHaveBeenCalledTimes(3);
    const calls = write.mock.calls.map((c) => c[0] as string);
    expect(calls[0]).toContain('id: 1');
    expect(calls[1]).toContain('id: 2');
    expect(calls[2]).toContain('id: 3');
    // Ensure no duplicate seq 2 frame
    const seq2Frames = calls.filter((f) => f.startsWith('id: 2'));
    expect(seq2Frames).toHaveLength(1);
  });
});
