import { EventType } from '@sagewright/shared';
import { describe, expect, it } from 'vitest';

import { createEventBus } from './event-bus';

describe('event-bus', () => {
  it('delivers published events to a subscriber', async () => {
    const bus = createEventBus();
    const received: number[] = [];
    const iter = bus.subscribe('t1')[Symbol.asyncIterator]();
    const evt = { seq: 1, type: EventType.LOG, payload: {}, createdAt: 'now' };
    const pending = iter.next();
    bus.publish('t1', evt);
    const { value } = await pending;
    received.push(value.seq);
    expect(received).toEqual([1]);
  });

  it('delivers a published event to all subscribers', async () => {
    const bus = createEventBus();
    const i1 = bus.subscribe('t1')[Symbol.asyncIterator]();
    const i2 = bus.subscribe('t1')[Symbol.asyncIterator]();
    const p1 = i1.next();
    const p2 = i2.next();
    const evt = { seq: 1, type: EventType.LOG, payload: {}, createdAt: 'now' };
    bus.publish('t1', evt);
    expect((await p1).value.seq).toBe(1);
    expect((await p2).value.seq).toBe(1);
  });

  it('resolves a parked next() with done on return() so disconnects do not leak', async () => {
    const bus = createEventBus();
    const iter = bus.subscribe('t1')[Symbol.asyncIterator]();
    const pending = iter.next(); // parks, no event published
    await iter.return!(); // disconnect
    const result = await pending;
    expect(result.done).toBe(true);
    // A subsequent publish to a now-empty topic must not throw (subscriber was cleaned up).
    expect(() => bus.publish('t1', { seq: 9, type: EventType.LOG, payload: {}, createdAt: 'now' })).not.toThrow();
  });

  it('drops the oldest events past the high-water mark for a non-consuming subscriber', async () => {
    const bus = createEventBus();
    const iter = bus.subscribe('t1')[Symbol.asyncIterator]();
    // Publish well past the 1000-event cap without consuming.
    for (let seq = 1; seq <= 1010; seq += 1) {
      bus.publish('t1', { seq, type: EventType.LOG, payload: {}, createdAt: 'now' });
    }
    // The first 10 were dropped; the queue holds seq 11..1010.
    expect((await iter.next()).value.seq).toBe(11);
  });
});
