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
});
