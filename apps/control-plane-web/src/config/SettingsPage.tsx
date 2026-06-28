import {
  Box,
  Button,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  Alert,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import type { RepoStatus } from '@sagewright/shared';
import { useEffect, useState, type FC } from 'react';

import {
  useDisconnectGithub,
  useGithubStatus,
  revealUserEnv,
  useRepos,
  useSaveRepos,
  useSaveGithubToken,
  useSetDefaultWorker,
  useUpdateUserEnv,
  useUserEnv,
  useWorkers,
} from '../api/hooks';

const REPOS_PLACEHOLDER = `https://github.com/owner/repo
https://github.com/owner/another-repo

Use HTTPS URLs, not SSH syntax like git@github.com:owner/repo.git`;

const statusColor = (s: RepoStatus): 'success' | 'warning' | 'error' =>
  s === 'present' ? 'success' : s === 'cloning' ? 'warning' : 'error';

const GithubSection: FC = () => {
  const { data: status } = useGithubStatus();
  const saveToken = useSaveGithubToken();
  const disconnect = useDisconnectGithub();
  const [token, setToken] = useState('');

  const save = async (): Promise<void> => {
    await saveToken.mutateAsync(token);
    setToken('');
  };

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Typography variant="h6" gutterBottom>GitHub</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Connect a classic GitHub token so Sagewright clones, pushes, opens PRs, and commits as you on
        repos you can access.
      </Typography>
      {status?.connected ? (
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip size="small" color="success" label={`Connected as @${status.login}`} />
            <Typography variant="body2" color="text.secondary">{status.email}</Typography>
          </Stack>
          {status.missingRepoScope && (
            <Alert severity="warning">This token is missing the classic repo scope.</Alert>
          )}
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => { void disconnect.mutateAsync(); }}
            disabled={disconnect.isPending}
          >
            Disconnect
          </Button>
        </Stack>
      ) : (
        <Stack spacing={1}>
          <TextField
            fullWidth
            type="password"
            label="Classic personal access token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
          />
          <Button variant="contained" onClick={save} disabled={!token.trim() || saveToken.isPending}>
            Save token
          </Button>
        </Stack>
      )}
    </Box>
  );
};

const ReposSection: FC = () => {
  const { data: repos = [] } = useRepos();
  const saveRepos = useSaveRepos();
  const [text, setText] = useState('');

  // Seed the textarea from the server once (and whenever the set of repos changes).
  const serverText = repos.map((r) => r.url).join('\n');
  useEffect(() => {
    setText(serverText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverText]);

  const save = (): void => {
    const urls = text.split('\n').map((l) => l.trim()).filter(Boolean);
    void saveRepos.mutateAsync(urls);
  };

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Typography variant="h6" gutterBottom>Your repositories</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        One HTTPS repo URL per line, managed here per-user — use
        https://github.com/owner/repo, not SSH syntax like git@github.com:owner/repo.git. These are
        yours alone; each is cloned onto the shared volume and your sessions get a worktree per repo.
      </Typography>
      <TextField
        fullWidth
        multiline
        minRows={4}
        placeholder={REPOS_PLACEHOLDER}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button variant="contained" onClick={save} disabled={saveRepos.isPending} sx={{ mt: 1 }}>
        Save
      </Button>
      <List dense sx={{ mt: 1 }}>
        {repos.map((r) => (
          <ListItem key={r.id} secondaryAction={<Chip size="small" label={r.status} color={statusColor(r.status)} />}>
            <ListItemText primary={r.slug} secondary={r.error ?? r.url} />
          </ListItem>
        ))}
      </List>
    </Box>
  );
};

const ENV_PLACEHOLDER = `OPENAI_API_KEY=sk-...
NPM_TOKEN=...
NODE_AUTH_TOKEN=...`;

const EnvironmentSection: FC = () => {
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
    <Box sx={{ maxWidth: 560 }}>
      <Typography variant="h6" gutterBottom>Environment</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        A custom <code>.env</code> injected into your sessions at runtime and encrypted at rest.
        These override the org-wide defaults baked into the worker image from the host{' '}
        <code>.env</code> — e.g. add API keys or registry tokens your sessions need. GitHub
        credentials are managed above via your personal access token.
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
    </Box>
  );
};

const WorkerSection: FC = () => {
  const { data } = useWorkers();
  const workers = data?.workers ?? [];
  const defaultImage = data?.defaultImage ?? null;
  const setDefaultWorker = useSetDefaultWorker();
  const selected = workers.some((w) => w.image === defaultImage) ? defaultImage : '';

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Typography variant="h6" gutterBottom>Default worker</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        The worker image new sessions start with by default. You can still pick a different worker per
        session from the New session button.
      </Typography>
      {workers.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No worker images found.</Typography>
      ) : (
        <TextField
          select
          fullWidth
          label="Worker image"
          value={selected ?? ''}
          onChange={(e) => { void setDefaultWorker.mutateAsync(e.target.value); }}
          disabled={setDefaultWorker.isPending}
        >
          {workers.map((w) => (
            <MenuItem key={w.id} value={w.image}>
              {w.name}
            </MenuItem>
          ))}
        </TextField>
      )}
    </Box>
  );
};

export const SettingsPage: FC = () => (
  <Stack spacing={3}>
    <GithubSection />
    <Divider />
    <ReposSection />
    <Divider />
    <EnvironmentSection />
    <Divider />
    <WorkerSection />
  </Stack>
);
