import { Chip, type ChipProps } from '@mui/material';
import { type FC } from 'react';

import { useWorkers } from '../api/hooks';

/**
 * Shows which worker type a session runs, resolving the stored image ref to its
 * human-friendly worker name. Renders nothing for sessions with no worker image.
 */
export const WorkerChip: FC<{ image: string | null; size?: ChipProps['size'] }> = ({ image, size = 'small' }) => {
  const { data } = useWorkers();
  if (!image) return null;
  const name = data?.workers.find((w) => w.image === image)?.name ?? image;
  return <Chip label={name} size={size} variant="outlined" />;
};
