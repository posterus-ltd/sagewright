import {
  Alert,
  Button,
  Chip,
  Collapse,
  Link,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useState, type FC } from 'react';

import { useDisconnectGithub, useGithubStatus, useSaveGithubToken } from '../api/hooks';

export const GithubSection: FC = () => {
  const { data: status } = useGithubStatus();
  const saveToken = useSaveGithubToken();
  const disconnect = useDisconnectGithub();
  const [token, setToken] = useState('');
  const [showScopes, setShowScopes] = useState(false);

  const save = async (): Promise<void> => {
    await saveToken.mutateAsync(token);
    setToken('');
  };

  return (
    <>
      <Typography variant="h6" gutterBottom>GitHub</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Connect a classic GitHub token so Sagewright clones, pushes, opens PRs, and commits as you on
        repos you can access.
      </Typography>
      {status?.connected ? (
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
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
          <Button
            variant="text"
            size="small"
            onClick={() => setShowScopes((v) => !v)}
            endIcon={
              <ExpandMoreIcon
                sx={{
                  transform: showScopes ? 'rotate(180deg)' : 'none',
                  transition: (theme) => theme.transitions.create('transform'),
                }}
              />
            }
            sx={{ alignSelf: 'flex-start' }}
          >
            Which scopes does the token need?
          </Button>
          <Collapse in={showScopes} unmountOnExit>
            <Alert severity="info">
              <Typography variant="body2" component="div">
                When creating the token, enable these scopes:
              </Typography>
              <List dense disablePadding sx={{ mt: 0.5 }}>
                <ListItem disableGutters sx={{ py: 0 }}>
                  <ListItemText
                    primary="repo"
                    secondary="Required — clone, fetch, push, and open pull requests on repos you can access."
                  />
                </ListItem>
                <ListItem disableGutters sx={{ py: 0 }}>
                  <ListItemText
                    primary="read:user"
                    secondary="Recommended — read your GitHub identity so sessions run as you."
                  />
                </ListItem>
                <ListItem disableGutters sx={{ py: 0 }}>
                  <ListItemText
                    primary="user:email"
                    secondary="Recommended — commit under your real email (otherwise a noreply address is used)."
                  />
                </ListItem>
              </List>
              <Link
                href="https://github.com/settings/tokens/new?scopes=repo,read:user,user:email&description=Sagewright"
                target="_blank"
                rel="noopener"
              >
                Create a pre-scoped token on GitHub
              </Link>
            </Alert>
          </Collapse>
          <Button variant="contained" onClick={save} disabled={!token.trim() || saveToken.isPending}>
            Save token
          </Button>
        </Stack>
      )}
    </>
  );
};
