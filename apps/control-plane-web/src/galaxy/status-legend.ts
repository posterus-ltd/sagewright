import { SessionStatus } from '@sagewright/shared';

import type { Palette } from '../theme/tokens';

export enum StatusGroupKey {
  ACTIVE = 'active',
  ATTENTION = 'attention',
  DONE = 'done',
  FAILED = 'failed',
  DETACHED = 'detached',
}

export interface StatusGroup {
  key: StatusGroupKey;
  label: string;
  // Legend swatches resolve through the palette so they recolor with the theme,
  // and stay in lockstep with starColor (asserted by test).
  paletteKey: keyof Palette;
  statuses: readonly SessionStatus[];
}

/** The legend's five lenses over the field — same partition starColor draws with. */
export const STATUS_GROUPS: readonly StatusGroup[] = [
  {
    key: StatusGroupKey.ACTIVE,
    label: 'Active',
    paletteKey: 'info',
    statuses: [SessionStatus.QUEUED, SessionStatus.PROVISIONING, SessionStatus.RUNNING, SessionStatus.PUSHING],
  },
  {
    key: StatusGroupKey.ATTENTION,
    label: 'Needs attention',
    paletteKey: 'warning',
    statuses: [SessionStatus.NEEDS_ASSISTANCE, SessionStatus.MAX_ITERATIONS],
  },
  { key: StatusGroupKey.DONE, label: 'Done', paletteKey: 'success', statuses: [SessionStatus.DONE] },
  { key: StatusGroupKey.FAILED, label: 'Failed', paletteKey: 'error', statuses: [SessionStatus.FAILED, SessionStatus.STOPPED] },
  { key: StatusGroupKey.DETACHED, label: 'Detached', paletteKey: 'muted', statuses: [SessionStatus.DETACHED] },
];

const GROUP_BY_STATUS = new Map<SessionStatus, StatusGroupKey>(
  STATUS_GROUPS.flatMap((g) => g.statuses.map((s) => [s, g.key] as const)),
);

export const statusGroupKey = (status: SessionStatus): StatusGroupKey => GROUP_BY_STATUS.get(status)!;

export const countByGroup = (statuses: SessionStatus[]): Record<StatusGroupKey, number> => {
  const counts = Object.fromEntries(STATUS_GROUPS.map((g) => [g.key, 0])) as Record<StatusGroupKey, number>;
  for (const status of statuses) counts[statusGroupKey(status)] += 1;
  return counts;
};
