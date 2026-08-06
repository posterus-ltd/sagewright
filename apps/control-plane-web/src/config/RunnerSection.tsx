import { MenuItem, TextField, Typography } from '@mui/material';
import { type FC } from 'react';

import { useRunners, useSetDefaultRunner } from '../api/hooks';

export const RunnerSection: FC = () => {
  const { data } = useRunners();
  const runners = data?.runners ?? [];
  const defaultImage = data?.defaultImage ?? null;
  const setDefaultRunner = useSetDefaultRunner();
  const selected = runners.some((w) => w.image === defaultImage) ? defaultImage : '';

  return (
    <>
      <Typography variant="h6" gutterBottom>Default runner</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        The runner image new sessions start with by default. You can still pick a different runner per
        session from the New session button.
      </Typography>
      {runners.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No runner images found.</Typography>
      ) : (
        <TextField
          select
          fullWidth
          label="Runner image"
          value={selected ?? ''}
          onChange={(e) => { void setDefaultRunner.mutateAsync(e.target.value); }}
          disabled={setDefaultRunner.isPending}
        >
          {runners.map((w) => (
            <MenuItem key={w.id} value={w.image}>
              {w.name}
            </MenuItem>
          ))}
        </TextField>
      )}
    </>
  );
};
