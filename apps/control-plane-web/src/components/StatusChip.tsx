import { Chip } from '@mui/material';
import { SessionStatus } from '@sagewright/shared';
import type { FC } from 'react';

const COLOR: Record<SessionStatus, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  [SessionStatus.DONE]: 'success',
  [SessionStatus.FAILED]: 'error',
  [SessionStatus.STOPPED]: 'error',
  [SessionStatus.NEEDS_ASSISTANCE]: 'warning',
  [SessionStatus.QUEUED]: 'info',
  [SessionStatus.PROVISIONING]: 'info',
  [SessionStatus.RUNNING]: 'info',
  // Backgrounded and resumable — distinct from the active 'info' states.
  [SessionStatus.DETACHED]: 'default',
  [SessionStatus.PUSHING]: 'info',
};

export const StatusChip: FC<{ status: SessionStatus }> = ({ status }) => (
  <Chip label={status} color={COLOR[status]} size="small" />
);
