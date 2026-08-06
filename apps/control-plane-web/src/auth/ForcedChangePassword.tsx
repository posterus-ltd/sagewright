import { Box, Button, Typography } from '@mui/material';
import { type FC } from 'react';

import { ChangePasswordForm } from '../components/ChangePasswordForm';
import { fonts } from '../theme/tokens';
import { useAuth } from './useAuth';

// Full-screen gate shown while a user still `mustChangePassword` — root's first login
// or after an admin reset. The "current" password is the one they just signed in with
// (the configured ROOT_PASSWORD, or the one-time password an admin shared). A successful
// change invalidates `me`, so the gate re-renders and lets the app through.
export const ForcedChangePassword: FC = () => {
  const { logout } = useAuth();

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
      <Box sx={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
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

        <ChangePasswordForm
          submitLabel="Set password & continue"
          emphasizeSubmit
          autoFocusCurrent
          actions={
            <Button type="button" onClick={() => void logout()} size="small" sx={{ alignSelf: 'center' }}>
              Sign out
            </Button>
          }
        />
      </Box>
    </Box>
  );
};
