import { Box, Button, Stack, TextField } from '@mui/material';
import { useSnackbar } from 'notistack';
import { useState, type FC, type ReactNode } from 'react';

import { useChangePassword } from '../api/hooks';
import { PasswordFields, isPasswordPairValid } from './PasswordFields';

export interface ChangePasswordFormProps {
  /** Text for the submit button (e.g. "Update password" or "Set password & continue"). */
  submitLabel: string;
  /** Render the submit button large and full-width, for the full-screen gate. */
  emphasizeSubmit?: boolean;
  /** Focus the current-password field on mount (used by the first-login gate). */
  autoFocusCurrent?: boolean;
  /** Run after a successful change — e.g. to dismiss a dialog. Fields reset either way. */
  onSuccess?: () => void;
  /** Extra actions rendered after the submit button, such as a "Sign out" link. */
  actions?: ReactNode;
}

// The shared "prove it's you, then choose a new one" form: the current-password field
// plus the PasswordFields checklist, wired to the change-password mutation. Reused by
// the self-service settings section and the forced first-login gate; callers supply
// only the surrounding chrome (headings, layout) and the submit wording.
export const ChangePasswordForm: FC<ChangePasswordFormProps> = ({
  submitLabel,
  emphasizeSubmit = false,
  autoFocusCurrent = false,
  onSuccess,
  actions,
}) => {
  const changePassword = useChangePassword();
  const { enqueueSnackbar } = useSnackbar();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const isValid = current.trim().length > 0 && isPasswordPairValid(next, confirm);

  const submit = async (): Promise<void> => {
    if (!isValid) return;
    try {
      await changePassword.mutateAsync({ currentPassword: current, newPassword: next });
      enqueueSnackbar('Password updated', { variant: 'success' });
      setCurrent('');
      setNext('');
      setConfirm('');
      onSuccess?.();
    } catch {
      enqueueSnackbar('Could not change password — check your current password', { variant: 'error' });
    }
  };

  return (
    <Box component="form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <Stack spacing={2}>
        <TextField
          type="password"
          label="Current password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          autoFocus={autoFocusCurrent}
        />
        <PasswordFields
          password={next}
          confirm={confirm}
          onPasswordChange={setNext}
          onConfirmChange={setConfirm}
          confirmLabel="Confirm new password"
        />
        <Button
          type="submit"
          variant="contained"
          size={emphasizeSubmit ? 'large' : 'medium'}
          disabled={!isValid || changePassword.isPending}
          sx={emphasizeSubmit ? undefined : { alignSelf: 'flex-start' }}
        >
          {submitLabel}
        </Button>
        {actions}
      </Stack>
    </Box>
  );
};
