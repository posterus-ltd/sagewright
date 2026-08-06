import { Typography } from '@mui/material';
import { type FC } from 'react';

import { ChangePasswordForm } from '../components/ChangePasswordForm';

// Self-service password change, available to every user regardless of role.
export const ChangePasswordSection: FC = () => (
  <>
    <Typography variant="h6" gutterBottom>Change password</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
      Update your own password. You'll need your current password to confirm it's you.
    </Typography>
    <ChangePasswordForm submitLabel="Update password" />
  </>
);
