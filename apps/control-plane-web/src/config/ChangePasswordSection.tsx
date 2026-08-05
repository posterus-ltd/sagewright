import { MIN_PASSWORD_LENGTH } from '@sagewright/shared';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import { useState, type FC } from 'react';

import { useChangePassword } from '../api/hooks';

// Self-service password change, available to every user regardless of role.
export const ChangePasswordSection: FC = () => {
  const changePassword = useChangePassword();
  const { enqueueSnackbar } = useSnackbar();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== next;
  const isValid = current.trim().length > 0 && next.length >= MIN_PASSWORD_LENGTH && confirm === next;

  const save = async (): Promise<void> => {
    if (!isValid) return;
    try {
      await changePassword.mutateAsync({ currentPassword: current, newPassword: next });
      enqueueSnackbar('Password updated', { variant: 'success' });
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch {
      enqueueSnackbar('Could not change password — check your current password', { variant: 'error' });
    }
  };

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Typography variant="h6" gutterBottom>Change password</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Update your own password. You'll need your current password to confirm it's you.
      </Typography>
      <Box component="form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <Stack spacing={2}>
          <TextField
            type="password"
            label="Current password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
          />
          <TextField
            type="password"
            label="New password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            error={tooShort}
            helperText={tooShort ? `At least ${MIN_PASSWORD_LENGTH} characters` : ' '}
          />
          <TextField
            type="password"
            label="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            error={mismatch}
            helperText={mismatch ? 'Passwords do not match' : ' '}
          />
          <Button type="submit" variant="contained" disabled={!isValid || changePassword.isPending} sx={{ alignSelf: 'flex-start' }}>
            Update password
          </Button>
        </Stack>
      </Box>
    </Box>
  );
};
