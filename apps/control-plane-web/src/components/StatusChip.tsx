import { Chip } from '@mui/material';
import { SessionStatus } from '@sagewright/shared';
import type { FC } from 'react';

// Single source of truth for status → chip color, shared with anywhere else
// (e.g. workflow run views) that renders a SessionStatus as a colored Chip.
export const SESSION_STATUS_COLOR: Record<SessionStatus, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  [SessionStatus.DONE]: 'success',
  [SessionStatus.FAILED]: 'error',
  [SessionStatus.STOPPED]: 'error',
  [SessionStatus.MAX_ITERATIONS]: 'warning',
  [SessionStatus.NEEDS_ASSISTANCE]: 'warning',
  [SessionStatus.QUEUED]: 'info',
  [SessionStatus.PROVISIONING]: 'info',
  [SessionStatus.RUNNING]: 'info',
  // Backgrounded and resumable — distinct from the active 'info' states.
  [SessionStatus.DETACHED]: 'default',
  [SessionStatus.PUSHING]: 'info',
};

export const StatusChip: FC<{ status: SessionStatus }> = ({ status }) => (
  <Chip label={status} color={SESSION_STATUS_COLOR[status]} size="small" />
);
