import type { StreamEvent } from '@sagewright/shared';

interface Subscriber {
  queue: StreamEvent[];
  resolve: ((r: IteratorResult<StreamEvent>) => void) | null;
}

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
          cleanup();
          return Promise.resolve({ value: undefined as never, done: true });
        },
      };
    },
  });

  return { publish, subscribe };
};

export type EventBus = ReturnType<typeof createEventBus>;
