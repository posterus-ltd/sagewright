import { SessionStatus } from '@sagewright/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startDemoDirector } from './director';
import { DEMO_RUN_ID } from './mock-data';
import { createDemoStore } from './store';

describe('demo director', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('advances the in-flight workflow run to done and ships a PR', () => {
    const store = createDemoStore();
    const stop = startDemoDirector(store);
    // Storyline: implement done → validate (11s) → run done + PR (22s).
    vi.advanceTimersByTime(23_000);

    const parent = store.sessions.find((s) => s.id === DEMO_RUN_ID);
    expect(parent?.status).toBe(SessionStatus.DONE);
    expect(parent?.prUrl).toBeTruthy();

    const run = store.runs.find((r) => r.id === DEMO_RUN_ID);
    expect(run?.status).toBe(SessionStatus.DONE);
    stop();
  });

  it('churns the galaxy by spawning new stars over time', () => {
    const store = createDemoStore();
    const before = store.sessions.length;
    const stop = startDemoDirector(store);
    vi.advanceTimersByTime(9_000 * 3);
    expect(store.sessions.length).toBeGreaterThan(before);
    stop();
  });

  it('stops scheduling once the cleanup runs', () => {
    const store = createDemoStore();
    const stop = startDemoDirector(store);
    stop();
    const count = store.sessions.length;
    vi.advanceTimersByTime(60_000);
    // No further churn after cleanup.
    expect(store.sessions.length).toBe(count);
  });
});
