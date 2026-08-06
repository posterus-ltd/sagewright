import {
  Button,
  Chip,
  List,
  ListItem,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import { RepoStatus } from '@sagewright/shared';
import { useEffect, useState, type FC } from 'react';

import { useRepos, useSaveRepos } from '../api/hooks';

const REPOS_PLACEHOLDER = `https://github.com/owner/repo
https://github.com/owner/another-repo

Use HTTPS URLs, not the SSH format.`;

const statusColor = (s: RepoStatus): 'success' | 'warning' | 'error' =>
  s === RepoStatus.PRESENT
    ? 'success'
    : s === RepoStatus.CLONING
      ? 'warning'
      : 'error';

export const ReposSection: FC = () => {
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
    const urls = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    void saveRepos.mutateAsync(urls);
  };

  return (
    <>
      <Typography variant="h6" gutterBottom>
        Your repositories
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        One HTTPS repo URL per line, managed here per-user — use
        https://github.com/owner/repo, not the SSH format. These are yours
        alone; each is cloned onto the shared volume and your sessions get a
        worktree per repo.
      </Typography>
      <TextField
        fullWidth
        multiline
        minRows={4}
        placeholder={REPOS_PLACEHOLDER}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button
        variant="contained"
        onClick={save}
        disabled={saveRepos.isPending}
        sx={{ mt: 1 }}
      >
        Save
      </Button>
      <List dense sx={{ mt: 1 }}>
        {repos.map((r) => (
          <ListItem
            key={r.id}
            secondaryAction={
              <Chip
                size="small"
                label={r.status}
                color={statusColor(r.status)}
              />
            }
          >
            <ListItemText primary={r.slug} secondary={r.error ?? r.url} />
          </ListItem>
        ))}
      </List>
    </>
  );
};
