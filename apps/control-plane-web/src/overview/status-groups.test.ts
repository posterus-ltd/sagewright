import { SessionStatus, type Session } from '@sagewright/shared';
import { describe, expect, it } from 'vitest';

import { groupCounts, statusGroup, StatusGroup } from './status-groups';

const task = (status: SessionStatus): Session => ({
  id: `t-${status}`,
  kind: 'interactive',
  name: null,
  prompt: null,
  workerImage: null,
  status,
  branch: null,
  prUrl: null,
  createdBy: 'u1',
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
  createdAt: '',
  updatedAt: '',
});

describe('statusGroup', () => {
  it('buckets every SessionStatus into exactly one group', () => {
    const expected: Record<SessionStatus, StatusGroup> = {
      [SessionStatus.QUEUED]: StatusGroup.RUNNING,
      [SessionStatus.PROVISIONING]: StatusGroup.RUNNING,
      [SessionStatus.RUNNING]: StatusGroup.RUNNING,
      [SessionStatus.PUSHING]: StatusGroup.RUNNING,
      [SessionStatus.NEEDS_ASSISTANCE]: StatusGroup.NEEDS_ATTENTION,
      [SessionStatus.FAILED]: StatusGroup.FAILED,
      [SessionStatus.STOPPED]: StatusGroup.FAILED,
      [SessionStatus.MAX_ITERATIONS]: StatusGroup.FAILED,
      [SessionStatus.DONE]: StatusGroup.DONE,
      [SessionStatus.DETACHED]: StatusGroup.DETACHED,
    };
    for (const [status, group] of Object.entries(expected)) {
      expect(statusGroup(status as SessionStatus)).toBe(group);
    }
  });
});

describe('groupCounts', () => {
  it('returns zero counts for every group when there are no sessions', () => {
    expect(groupCounts([])).toEqual([
      { group: StatusGroup.RUNNING, count: 0 },
      { group: StatusGroup.NEEDS_ATTENTION, count: 0 },
      { group: StatusGroup.FAILED, count: 0 },
      { group: StatusGroup.DONE, count: 0 },
      { group: StatusGroup.DETACHED, count: 0 },
    ]);
  });

  it('tallies sessions into their groups', () => {
    const sessions = [
      task(SessionStatus.RUNNING),
      task(SessionStatus.QUEUED),
      task(SessionStatus.NEEDS_ASSISTANCE),
      task(SessionStatus.FAILED),
      task(SessionStatus.STOPPED),
      task(SessionStatus.DONE),
      task(SessionStatus.DETACHED),
    ];
    expect(groupCounts(sessions)).toEqual([
      { group: StatusGroup.RUNNING, count: 2 },
      { group: StatusGroup.NEEDS_ATTENTION, count: 1 },
      { group: StatusGroup.FAILED, count: 2 },
      { group: StatusGroup.DONE, count: 1 },
      { group: StatusGroup.DETACHED, count: 1 },
    ]);
  });
});
