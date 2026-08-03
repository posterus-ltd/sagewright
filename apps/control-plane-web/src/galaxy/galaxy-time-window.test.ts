import { SessionKind, SessionStatus, type Session } from '@sagewright/shared';
import { describe, expect, it } from 'vitest';

import { filterSessionsByWindow, GALAXY_TIME_WINDOWS, GalaxyTimeWindow } from './galaxy-time-window';

const NOW = Date.parse('2026-07-01T00:00:00.000Z');
const daysAgo = (days: number): string => new Date(NOW - days * 86_400_000).toISOString();

const session = (over: Partial<Session>): Session => ({
  id: 's1',
  kind: SessionKind.HEADLESS,
  name: null,
  prompt: null,
  runnerImage: 'claude-code',
  status: SessionStatus.DONE,
  branch: null,
  prUrl: null,
  createdBy: 'al',
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
  createdAt: daysAgo(1),
  updatedAt: daysAgo(1),
  ...over,
});

describe('GALAXY_TIME_WINDOWS', () => {
  it('always offers an all-time option so history is hidden by default, never unreachable', () => {
    expect(GALAXY_TIME_WINDOWS.map((w) => w.value)).toContain(GalaxyTimeWindow.ALL);
  });
});

describe('filterSessionsByWindow', () => {
  it('returns every session for the all-time window', () => {
    const sessions = [session({ id: 'old', createdAt: daysAgo(400) }), session({ id: 'new' })];
    expect(filterSessionsByWindow(sessions, GalaxyTimeWindow.ALL, NOW)).toHaveLength(2);
  });

  it('keeps sessions created inside the window and drops settled ones outside it', () => {
    const sessions = [
      session({ id: 'recent', createdAt: daysAgo(10) }),
      session({ id: 'stale', createdAt: daysAgo(40) }),
    ];
    expect(filterSessionsByWindow(sessions, GalaxyTimeWindow.DAYS_30, NOW).map((s) => s.id)).toEqual(['recent']);
  });

  it('keeps an old session whose work ended inside the window — a recent finish is recent activity', () => {
    const finishedRecently = session({ id: 'a', createdAt: daysAgo(60), endedAt: daysAgo(5) });
    expect(filterSessionsByWindow([finishedRecently], GalaxyTimeWindow.DAYS_30, NOW)).toHaveLength(1);
  });

  it('always keeps non-terminal sessions — anything still alive is happening now, whatever its age', () => {
    const sessions = [
      session({ id: 'running', status: SessionStatus.RUNNING, createdAt: daysAgo(90) }),
      session({ id: 'stuck', status: SessionStatus.NEEDS_ASSISTANCE, createdAt: daysAgo(90) }),
      session({ id: 'idle', status: SessionStatus.DETACHED, createdAt: daysAgo(90) }),
    ];
    expect(filterSessionsByWindow(sessions, GalaxyTimeWindow.DAYS_30, NOW)).toHaveLength(3);
  });

  it('widens with the window: a 40-day-old session is outside 30d but inside 90d', () => {
    const sessions = [session({ id: 'a', createdAt: daysAgo(40) })];
    expect(filterSessionsByWindow(sessions, GalaxyTimeWindow.DAYS_30, NOW)).toHaveLength(0);
    expect(filterSessionsByWindow(sessions, GalaxyTimeWindow.DAYS_90, NOW)).toHaveLength(1);
  });
});
