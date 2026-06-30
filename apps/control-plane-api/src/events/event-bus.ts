import type { StreamEvent } from '@sagewright/shared';

interface Subscriber {
  queue: StreamEvent[];
  resolve: ((r: IteratorResult<StreamEvent>) => void) | null;
}

// Cap a slow/stuck subscriber's backlog. Past this we drop the OLDEST events so a
// wedged SSE client can't grow the queue without bound (memory backpressure).
const HIGH_WATER = 1000;

export const createEventBus = () => {
  const subs = new Map<string, Set<Subscriber>>();

  const publish = (taskId: string, e: StreamEvent): void => {
    const set = subs.get(taskId);
    if (!set) return;
    for (const sub of set) {
      if (sub.resolve) {
        const resolve = sub.resolve;
        sub.resolve = null;
        resolve({ value: e, done: false });
      } else {
        sub.queue.push(e);
        if (sub.queue.length > HIGH_WATER) sub.queue.shift();
      }
    }
  };

  const subscribe = (taskId: string): AsyncIterable<StreamEvent> => ({
    [Symbol.asyncIterator]: () => {
      const sub: Subscriber = { queue: [], resolve: null };
      const set = subs.get(taskId) ?? new Set<Subscriber>();
      set.add(sub);
      subs.set(taskId, set);
      const cleanup = (): void => {
        set.delete(sub);
        if (set.size === 0) subs.delete(taskId);
      };
      return {
        next: (): Promise<IteratorResult<StreamEvent>> => {
          if (sub.queue.length) return Promise.resolve({ value: sub.queue.shift() as StreamEvent, done: false });
          return new Promise((resolve) => { sub.resolve = resolve; });
        },
        return: (): Promise<IteratorResult<StreamEvent>> => {
          // Settle a parked next() FIRST so its awaiter (the SSE loop) unblocks and
          // returns — otherwise the promise never resolves and the subscriber leaks
          // in the set on every disconnect.
          if (sub.resolve) {
            const resolve = sub.resolve;
            sub.resolve = null;
            resolve({ value: undefined as never, done: true });
          }
          cleanup();
          return Promise.resolve({ value: undefined as never, done: true });
        },
      };
    },
  });

  return { publish, subscribe };
};

export type EventBus = ReturnType<typeof createEventBus>;
