import { SessionStatus } from '@sagewright/shared';

import type { Palette } from '../theme/tokens';

export type StatusGroupKey = 'active' | 'attention' | 'done' | 'failed' | 'detached';

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
    key: 'active',
    label: 'Active',
    paletteKey: 'info',
    statuses: [SessionStatus.QUEUED, SessionStatus.PROVISIONING, SessionStatus.RUNNING, SessionStatus.PUSHING],
  },
  {
    key: 'attention',
    label: 'Needs attention',
    paletteKey: 'warning',
    statuses: [SessionStatus.NEEDS_ASSISTANCE, SessionStatus.MAX_ITERATIONS],
  },
  { key: 'done', label: 'Done', paletteKey: 'success', statuses: [SessionStatus.DONE] },
  { key: 'failed', label: 'Failed', paletteKey: 'error', statuses: [SessionStatus.FAILED, SessionStatus.STOPPED] },
  { key: 'detached', label: 'Detached', paletteKey: 'muted', statuses: [SessionStatus.DETACHED] },
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
