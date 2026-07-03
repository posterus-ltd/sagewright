import { SessionStatus, type Session } from '@sagewright/shared';

// Mirrors StatusChip's color semantics so the dashboard's visual language
// matches the rest of the app (see components/StatusChip.tsx).
export enum StatusGroup {
  RUNNING = 'running',
  NEEDS_ATTENTION = 'needs_attention',
  FAILED = 'failed',
  DONE = 'done',
  DETACHED = 'detached',
}

export const STATUS_GROUP_LABEL: Record<StatusGroup, string> = {
  [StatusGroup.RUNNING]: 'Running',
  [StatusGroup.NEEDS_ATTENTION]: 'Needs attention',
  [StatusGroup.FAILED]: 'Failed',
  [StatusGroup.DONE]: 'Done',
  [StatusGroup.DETACHED]: 'Detached',
};

export const STATUS_GROUP_COLOR: Record<StatusGroup, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  [StatusGroup.RUNNING]: 'info',
  [StatusGroup.NEEDS_ATTENTION]: 'warning',
  [StatusGroup.FAILED]: 'error',
  [StatusGroup.DONE]: 'success',
  [StatusGroup.DETACHED]: 'default',
};

const GROUP_BY_STATUS: Record<SessionStatus, StatusGroup> = {
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

export const statusGroup = (status: SessionStatus): StatusGroup => GROUP_BY_STATUS[status];

// Display order for the stat tile row.
export const STATUS_GROUP_ORDER: StatusGroup[] = [
  StatusGroup.RUNNING,
  StatusGroup.NEEDS_ATTENTION,
  StatusGroup.FAILED,
  StatusGroup.DONE,
  StatusGroup.DETACHED,
];

export interface GroupCount {
  group: StatusGroup;
  count: number;
}

/** Counts sessions per status group, in display order, including zero counts. */
export const groupCounts = (sessions: Session[]): GroupCount[] => {
  const counts: Record<StatusGroup, number> = {
    [StatusGroup.RUNNING]: 0,
    [StatusGroup.NEEDS_ATTENTION]: 0,
    [StatusGroup.FAILED]: 0,
    [StatusGroup.DONE]: 0,
    [StatusGroup.DETACHED]: 0,
  };
  for (const s of sessions) counts[statusGroup(s.status)] += 1;
  return STATUS_GROUP_ORDER.map((group) => ({ group, count: counts[group] }));
};
