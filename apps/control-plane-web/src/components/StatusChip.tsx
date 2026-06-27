import { Chip } from '@mui/material';
import { TaskStatus } from '@sagewright/shared';
import type { FC } from 'react';

const COLOR: Record<TaskStatus, 'success' | 'error' | 'warning' | 'info'> = {
  [TaskStatus.DONE]: 'success',
  [TaskStatus.FAILED]: 'error',
  [TaskStatus.STOPPED]: 'error',
  [TaskStatus.NEEDS_ASSISTANCE]: 'warning',
  [TaskStatus.QUEUED]: 'info',
  [TaskStatus.PROVISIONING]: 'info',
  [TaskStatus.RUNNING]: 'info',
  [TaskStatus.PUSHING]: 'info',
};

export const StatusChip: FC<{ status: TaskStatus }> = ({ status }) => (
  <Chip label={status} color={COLOR[status]} size="small" />
);
