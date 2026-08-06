import { UserRole, type CreateUserResult } from '@sagewright/shared';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useState, type FC } from 'react';

import { ApiError } from '../api/client';
import { useCreateUser } from '../api/hooks';

// Letter-led handle: a letter first, then letters, digits or hyphens (3–32 chars).
// Stricter than the shared USERNAME_RE (which also allows a leading digit plus
// dot/underscore, min 2) on purpose — so a hyphen can't lead. Kept in sync with the hint below.
const USERNAME_RE = /^[a-z][a-z0-9-]{2,31}$/;

// Mount fresh per open (keyed) so the fields reset without a reset effect.
export const CreateUserDialog: FC<{
  open: boolean;
  onClose: () => void;
  onCreated: (result: CreateUserResult) => void;
}> = ({ open, onClose, onCreated }) => {
  const createUser = useCreateUser();
  const { enqueueSnackbar } = useSnackbar();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.USER);

  // Validate against the lowercased value — the backend lowercases at the boundary,
  // so `Alice` is fine and normalizes to `alice`.
  const name = username.trim().toLowerCase();
  const isValid = USERNAME_RE.test(name);
  const showError = username.trim().length > 0 && !isValid;

  const save = async (): Promise<void> => {
    if (!isValid) return;
    try {
      const result = await createUser.mutateAsync({ username: name, role });
      onCreated(result);
      onClose();
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 409
          ? 'That username is already taken'
          : 'Could not create user — check the username';
      enqueueSnackbar(message, { variant: 'error' });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Create user</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          A one-time password is generated for the new user and shown once for you to share.
        </Typography>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            error={showError}
            helperText={
              showError
                ? 'Must start with a letter, then only letters, digits or hyphens (3–32 chars).'
                : 'Lowercased. Start with a letter, then letters, digits or hyphens (3–32 chars).'
            }
          />
          <TextField
            select
            label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            <MenuItem value={UserRole.USER}>User</MenuItem>
            <MenuItem value={UserRole.ADMIN}>Admin</MenuItem>
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => void save()} disabled={!isValid || createUser.isPending}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
};
