import { Button, Stack, TextField, Typography } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useState, type FC } from 'react';

import { revealUserEnv, useUpdateUserEnv, useUserEnv } from '../api/hooks';

const ENV_PLACEHOLDER = `OPENAI_API_KEY=sk-...
NPM_TOKEN=...
NODE_AUTH_TOKEN=...`;

export const EnvironmentSection: FC = () => {
  const { data } = useUserEnv();
  const updateEnv = useUpdateUserEnv();
  const masked = data?.env ?? '';
  // Masked + read-only by default; revealing fetches plaintext and unlocks editing.
  const [revealed, setRevealed] = useState(false);
  const [draft, setDraft] = useState('');

  const reveal = async (): Promise<void> => {
    const { env } = await revealUserEnv();
    setDraft(env);
    setRevealed(true);
  };

  const hide = (): void => {
    setRevealed(false);
    setDraft('');
  };

  const save = async (): Promise<void> => {
    await updateEnv.mutateAsync(draft);
    hide();
  };

  return (
    <>
      <Typography variant="h6" gutterBottom>Environment</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        A custom <code>.env</code> injected into your sessions at runtime and encrypted at rest.
        These override the org-wide defaults baked into the runner image from the host{' '}
        <code>.env</code> — e.g. add API keys or registry tokens your sessions need. GitHub
        credentials are managed in the GitHub section via your personal access token.
      </Typography>
      <TextField
        fullWidth
        multiline
        minRows={6}
        placeholder={ENV_PLACEHOLDER}
        value={revealed ? draft : masked}
        onChange={(e) => setDraft(e.target.value)}
        slotProps={{ input: { readOnly: !revealed, sx: { fontFamily: 'monospace' } } }}
      />
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        {revealed ? (
          <>
            <Button variant="contained" onClick={save} disabled={updateEnv.isPending}>Save</Button>
            <Button startIcon={<VisibilityOffIcon />} onClick={hide}>Hide</Button>
          </>
        ) : (
          <Button variant="outlined" startIcon={<VisibilityIcon />} onClick={reveal}>Reveal &amp; edit</Button>
        )}
      </Stack>
    </>
  );
};
