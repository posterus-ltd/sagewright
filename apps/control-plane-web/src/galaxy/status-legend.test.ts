import { SessionStatus } from '@sagewright/shared';
import { describe, expect, it } from 'vitest';

import { dark } from '../theme/tokens';
import { starColor } from './star-appearance';
import { countByGroup, STATUS_GROUPS, statusGroupKey, StatusGroupKey } from './status-legend';

describe('STATUS_GROUPS', () => {
  it('covers every session status exactly once', () => {
    const covered = STATUS_GROUPS.flatMap((g) => g.statuses);
    expect([...covered].sort()).toEqual(Object.values(SessionStatus).sort());
  });

  it("each group's legend color matches the star color of every status in it", () => {
    for (const group of STATUS_GROUPS) {
      for (const status of group.statuses) {
        expect(starColor(status, dark)).toBe(dark[group.paletteKey]);
      }
    }
  });
});

describe('statusGroupKey', () => {
  it('maps statuses to their legend group', () => {
    expect(statusGroupKey(SessionStatus.RUNNING)).toBe(StatusGroupKey.ACTIVE);
    expect(statusGroupKey(SessionStatus.NEEDS_ASSISTANCE)).toBe(StatusGroupKey.ATTENTION);
    expect(statusGroupKey(SessionStatus.MAX_ITERATIONS)).toBe(StatusGroupKey.ATTENTION);
    expect(statusGroupKey(SessionStatus.DONE)).toBe(StatusGroupKey.DONE);
    expect(statusGroupKey(SessionStatus.FAILED)).toBe(StatusGroupKey.FAILED);
    expect(statusGroupKey(SessionStatus.STOPPED)).toBe(StatusGroupKey.FAILED);
    expect(statusGroupKey(SessionStatus.DETACHED)).toBe(StatusGroupKey.DETACHED);
  });
});

describe('countByGroup', () => {
  it('tallies statuses into their groups, zero-filling groups with no members', () => {
    const counts = countByGroup([
      SessionStatus.RUNNING,
      SessionStatus.QUEUED,
      SessionStatus.DONE,
      SessionStatus.NEEDS_ASSISTANCE,
    ]);
    expect(counts).toEqual({ active: 2, attention: 1, done: 1, failed: 0, detached: 0 });
  });
});
