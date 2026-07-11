import { SessionKind, SessionStatus, type Session } from '@sagewright/shared';
import { describe, expect, it } from 'vitest';

import { filterSessionsByScope, filterSessionsByView, GalaxyScope, GalaxyView } from './galaxy-filters';

const session = (over: Partial<Session>): Session => ({
  id: 's1',
  kind: SessionKind.HEADLESS,
  name: null,
  prompt: null,
  workerImage: 'claude-code',
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
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('filterSessionsByView', () => {
  const sessions = [
    session({ id: 'live' }),
    session({ id: 'shelved', archivedAt: '2026-06-01T00:00:00.000Z' }),
  ];

  it('shows only unarchived sessions in the active view', () => {
    expect(filterSessionsByView(sessions, GalaxyView.ACTIVE).map((s) => s.id)).toEqual(['live']);
  });

  it('shows only archived sessions in the archived view', () => {
    expect(filterSessionsByView(sessions, GalaxyView.ARCHIVED).map((s) => s.id)).toEqual(['shelved']);
  });
});

describe('filterSessionsByScope', () => {
  const sessions = [session({ id: 'mine', createdBy: 'al' }), session({ id: 'theirs', createdBy: 'bo' })];

  it('keeps everything in the all scope', () => {
    expect(filterSessionsByScope(sessions, GalaxyScope.ALL, 'al')).toHaveLength(2);
  });

  it('keeps only the current user\'s sessions in the mine scope', () => {
    expect(filterSessionsByScope(sessions, GalaxyScope.MINE, 'al').map((s) => s.id)).toEqual(['mine']);
  });

  it('matches nothing in the mine scope when no user is known', () => {
    expect(filterSessionsByScope(sessions, GalaxyScope.MINE, null)).toHaveLength(0);
  });
});
