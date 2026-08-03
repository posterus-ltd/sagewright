import { SessionStatus, type Session } from '@sagewright/shared';
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';

import {
  ownerActivity,
  recentlyShipped,
  throughputStats,
  runnerUtilization,
} from './metrics';

const NOW = DateTime.fromISO('2026-07-08T00:00:00.000Z');
const iso = (daysAgo: number): string => NOW.minus({ days: daysAgo }).toISO()!;

const task = (overrides: Partial<Session> = {}): Session => ({
  id: 't1',
  kind: 'interactive',
  name: null,
  prompt: null,
  runnerImage: null,
  status: SessionStatus.RUNNING,
  branch: null,
  prUrl: null,
  createdBy: 'alice',
  containerId: null,
  scheduledPromptId: null,
  parentSessionId: null,
  workflowId: null,
  workflowStepKey: null,
  currentStepKey: null,
  iteration: null,
  error: null,
  archivedAt: null,
  startedAt: null,
  endedAt: null,
  createdAt: iso(1),
  updatedAt: iso(1),
  ...overrides,
});

describe('throughputStats', () => {
  it('counts terminal sessions within the window and computes a success rate', () => {
    const sessions = [
      task({ id: 't1', status: SessionStatus.DONE, endedAt: iso(1) }),
      task({ id: 't2', status: SessionStatus.DONE, endedAt: iso(2) }),
      task({ id: 't3', status: SessionStatus.FAILED, endedAt: iso(3) }),
      // Outside the 7-day window — excluded.
      task({ id: 't4', status: SessionStatus.DONE, endedAt: iso(10) }),
      // Still running — not a terminal outcome.
      task({ id: 't5', status: SessionStatus.RUNNING }),
    ];
    expect(throughputStats(sessions, 7, NOW)).toEqual({
      completed: 2,
      failed: 1,
      successRatePct: 67,
    });
  });

  it('includes archived sessions — archiving only hides, it does not erase history', () => {
    const sessions = [
      task({ id: 't1', status: SessionStatus.DONE, endedAt: iso(1), archivedAt: iso(1) }),
    ];
    expect(throughputStats(sessions, 7, NOW).completed).toBe(1);
  });

  it('reports a null rate when nothing finished in the window', () => {
    expect(throughputStats([], 7, NOW).successRatePct).toBeNull();
  });

  it('falls back to updatedAt when endedAt is missing', () => {
    const sessions = [
      task({ id: 't1', status: SessionStatus.DONE, endedAt: null, updatedAt: iso(1) }),
    ];
    expect(throughputStats(sessions, 7, NOW).completed).toBe(1);
  });
});

describe('runnerUtilization', () => {
  it('tallies sessions per runner within the window, busiest first', () => {
    const sessions = [
      task({ id: 't1', runnerImage: 'claude-code', createdAt: iso(1) }),
      task({ id: 't2', runnerImage: 'claude-code', createdAt: iso(2) }),
      task({ id: 't3', runnerImage: 'codex', createdAt: iso(3) }),
      task({ id: 't4', runnerImage: 'codex', createdAt: iso(10) }), // outside window
      task({ id: 't5', runnerImage: null, createdAt: iso(1) }), // no runner — excluded
    ];
    expect(runnerUtilization(sessions, 7, NOW)).toEqual([
      { key: 'claude-code', count: 2 },
      { key: 'codex', count: 1 },
    ]);
  });
});

describe('ownerActivity', () => {
  it('tallies sessions per creator within the window, busiest first', () => {
    const sessions = [
      task({ id: 't1', createdBy: 'alice', createdAt: iso(1) }),
      task({ id: 't2', createdBy: 'bob', createdAt: iso(1) }),
      task({ id: 't3', createdBy: 'bob', createdAt: iso(2) }),
    ];
    expect(ownerActivity(sessions, 7, NOW)).toEqual([
      { key: 'bob', count: 2 },
      { key: 'alice', count: 1 },
    ]);
  });
});

describe('recentlyShipped', () => {
  it('returns PR-bearing sessions, most recent first, capped at the limit', () => {
    const sessions = [
      task({ id: 't1', prUrl: 'https://github.com/a/b/pull/1', endedAt: iso(3) }),
      task({ id: 't2', prUrl: 'https://github.com/a/b/pull/2', endedAt: iso(1) }),
      task({ id: 't3', prUrl: null, endedAt: iso(1) }), // no PR — excluded
    ];
    expect(recentlyShipped(sessions, 1).map((s) => s.id)).toEqual(['t2']);
  });
});
