import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import { Box, Stack, TextField, Typography } from '@mui/material';
import { PASSWORD_RULES, isStrongPassword } from '@sagewright/shared';
import { type FC } from 'react';

// "Passwords match" is a rule too, but it compares the two fields rather than testing a
// single password, so it's appended here rather than living in shared PASSWORD_RULES.
const MATCH_LABEL = 'Passwords match';

export interface PasswordFieldsProps {
  password: string;
  confirm: string;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  /** Defaults to "New password" — override for a first-time "Password" wording. */
  passwordLabel?: string;
  confirmLabel?: string;
}

/** A valid new password: every rule met and the confirmation matches it. */
export const isPasswordPairValid = (password: string, confirm: string): boolean =>
  isStrongPassword(password) && password === confirm;

const Requirement: FC<{ met: boolean; label: string }> = ({ met, label }) => (
  <Stack
    component="li"
    direction="row"
    spacing={0.75}
    sx={{ alignItems: 'center', color: met ? 'success.main' : 'text.secondary' }}
    aria-label={`${label}: ${met ? 'met' : 'not met'}`}
  >
    {met ? (
      <CheckCircleRoundedIcon sx={{ fontSize: 16 }} />
    ) : (
      <RadioButtonUncheckedRoundedIcon sx={{ fontSize: 16 }} />
    )}
    <Typography variant="caption">{label}</Typography>
  </Stack>
);

// New-password + confirm inputs with a live checklist of which requirements are met so
// far. Reused by the forced first-login change and the self-service change so the rules
// (and their wording) stay in lockstep with the server's schema — see PASSWORD_RULES.
export const PasswordFields: FC<PasswordFieldsProps> = ({
  password,
  confirm,
  onPasswordChange,
  onConfirmChange,
  passwordLabel = 'New password',
  confirmLabel = 'Confirm password',
}) => {
  const matches = password.length > 0 && password === confirm;

  return (
    <Stack spacing={2}>
      <TextField
        type="password"
        label={passwordLabel}
        value={password}
        onChange={(e) => onPasswordChange(e.target.value)}
        autoComplete="new-password"
      />
      <TextField
        type="password"
        label={confirmLabel}
        value={confirm}
        onChange={(e) => onConfirmChange(e.target.value)}
        autoComplete="new-password"
        error={confirm.length > 0 && !matches}
      />
      <Box
        component="ul"
        aria-label="Password requirements"
        sx={{ listStyle: 'none', m: 0, pl: 0.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}
      >
        {PASSWORD_RULES.map((rule) => (
          <Requirement key={rule.label} label={rule.label} met={rule.test(password)} />
        ))}
        <Requirement label={MATCH_LABEL} met={matches} />
      </Box>
    </Stack>
  );
};
