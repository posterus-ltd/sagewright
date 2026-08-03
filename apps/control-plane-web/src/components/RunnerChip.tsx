import { Chip, type ChipProps } from '@mui/material';
import { type FC } from 'react';

import { useRunners } from '../api/hooks';

/**
 * Shows which runner type a session runs, resolving the stored image ref to its
 * human-friendly runner name. Renders nothing for sessions with no runner image.
 */
export const RunnerChip: FC<{ image: string | null; size?: ChipProps['size'] }> = ({ image, size = 'small' }) => {
  const { data } = useRunners();
  if (!image) return null;
  const name = data?.runners.find((w) => w.image === image)?.name ?? image;
  return <Chip label={name} size={size} variant="outlined" />;
};
