import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { type FC } from 'react';

export interface SharedPassword {
  title: string;
  username: string;
  password: string;
}

// Shows a generated one-time password exactly once, for the admin to share out-of-band.
// Only its hash is stored server-side, so there is no way to see it again after closing.
export const SharePasswordDialog: FC<{ shared: SharedPassword | null; onClose: () => void }> = ({ shared, onClose }) => {
  const { enqueueSnackbar } = useSnackbar();

  const copy = async (): Promise<void> => {
    if (!shared) return;
    try {
      await navigator.clipboard.writeText(shared.password);
      enqueueSnackbar('Password copied', { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not copy — select and copy it manually', { variant: 'warning' });
    }
  };

  return (
    <Dialog open={!!shared} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{shared?.title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Share this one-time password with <strong>{shared?.username}</strong>. They'll be asked to
            change it on first sign-in.
          </Typography>
          <TextField
            value={shared?.password ?? ''}
            slotProps={{
              input: {
                readOnly: true,
                sx: { fontFamily: 'monospace', letterSpacing: '0.04em' },
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Copy">
                      <IconButton onClick={() => void copy()} edge="end" aria-label="Copy password">
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              },
            }}
          />
          <Alert severity="warning">This password won't be shown again.</Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
};
