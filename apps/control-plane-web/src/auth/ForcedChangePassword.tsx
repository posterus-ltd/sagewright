import { MIN_PASSWORD_LENGTH } from '@sagewright/shared';
import { Box, Button, TextField, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import { useState, type FC } from 'react';

import { useChangePassword } from '../api/hooks';
import { fonts } from '../theme/tokens';
import { useAuth } from './useAuth';

// Full-screen gate shown while a user still `mustChangePassword` — root's first login
// or after an admin reset. The "current" password is the one they just signed in with
// (the configured ROOT_PASSWORD, or the one-time password an admin shared).
export const ForcedChangePassword: FC = () => {
  const { logout } = useAuth();
  const changePassword = useChangePassword();
  const { enqueueSnackbar } = useSnackbar();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== next;
  const isValid =
    current.trim().length > 0 && next.length >= MIN_PASSWORD_LENGTH && confirm === next;

  const onSubmit = async (): Promise<void> => {
    if (!isValid) return;
    try {
      await changePassword.mutateAsync({ currentPassword: current, newPassword: next });
      enqueueSnackbar('Password updated', { variant: 'success' });
      // Success invalidates `me`; the gate re-renders and lets the app through.
    } catch {
      enqueueSnackbar('Could not change password — check your current password', { variant: 'error' });
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: { xs: 3, sm: 4 },
      }}
    >
      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit();
        }}
        sx={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 2.5 }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <Typography component="span" sx={{ color: 'primary.main', fontFamily: fonts.mono, fontWeight: 700, fontSize: 22 }}>
            ❯
          </Typography>
          <Typography component="span" sx={{ fontFamily: fonts.mono, fontWeight: 700, fontSize: 20, letterSpacing: '-0.02em' }}>
            sagewright
          </Typography>
        </Box>

        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Choose a new password
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            You must set a new password before continuing. Enter the password you just signed in with,
            then choose a new one.
          </Typography>
        </Box>

        <TextField
          label="Current password"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoFocus
          autoComplete="current-password"
          required
        />
        <TextField
          label="New password"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          error={tooShort}
          helperText={tooShort ? `At least ${MIN_PASSWORD_LENGTH} characters` : ' '}
          required
        />
        <TextField
          label="Confirm new password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          error={mismatch}
          helperText={mismatch ? 'Passwords do not match' : ' '}
          required
        />
        <Button type="submit" variant="contained" size="large" disabled={!isValid || changePassword.isPending}>
          Set password &amp; continue
        </Button>
        <Button onClick={() => void logout()} size="small" sx={{ alignSelf: 'center' }}>
          Sign out
        </Button>
      </Box>
    </Box>
  );
};
