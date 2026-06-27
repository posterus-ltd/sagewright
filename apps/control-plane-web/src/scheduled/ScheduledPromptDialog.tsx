import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type ScheduledPrompt } from '@sagewright/shared';
import { Cron } from 'croner';
import cronstrue from 'cronstrue';
import { useState, type FC } from 'react';

import {
  useCreateScheduledPrompt,
  useUpdateScheduledPrompt,
  useWorkers,
} from '../api/hooks';

// Sentinel for the worker <Select>: empty value means "inherit my default worker"
// (resolved server-side at fire time), distinct from any real image ref.
const INHERIT_DEFAULT = '';

export const describeCron = (cron: string): string | null => {
  const trimmed = cron.trim();
  if (!trimmed) return null;
  try {
    return cronstrue.toString(trimmed, { throwExceptionOnParseError: true });
  } catch {
    return null;
  }
};

const CRON_PRESETS: { label: string; cron: string }[] = [
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Daily at 9am', cron: '0 9 * * *' },
  { label: 'Every weekday at 9am', cron: '0 9 * * 1-5' },
  { label: 'Every Monday at 9am', cron: '0 9 * * 1' },
  { label: 'First of the month', cron: '0 9 1 * *' },
  { label: 'In five minutes', cron: '*/5 * * * *' },
];

const nextRuns = (cron: string, count: number): Date[] => {
  const trimmed = cron.trim();
  if (!trimmed) return [];
  try {
    return new Cron(trimmed).nextRuns(count);
  } catch {
    return [];
  }
};

const CronPreview: FC<{ cron: string }> = ({ cron }) => {
  if (!cron.trim()) return null;
  const description = describeCron(cron);
  if (description === null) {
    return (
      <Typography variant="body2" color="error">
        Not a valid cron expression
      </Typography>
    );
  }
  const runs = nextRuns(cron, 3);
  return (
    <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {description}
      </Typography>
      {runs.length > 0 && (
        <Stack sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Next runs
          </Typography>
          {runs.map((run) => (
            <Typography
              key={run.toISOString()}
              variant="caption"
              color="text.secondary"
            >
              {run.toLocaleString()}
            </Typography>
          ))}
        </Stack>
      )}
    </Box>
  );
};

// A single dialog drives both create and edit. When `editing` is provided the
// fields seed from it and the update hook is used; otherwise it creates anew.
// Mount this fresh per task (keyed) so seeding from props in useState is
// enough — no reset effect needed.
export const ScheduledPromptDialog: FC<{
  open: boolean;
  onClose: () => void;
  editing?: ScheduledPrompt;
}> = ({ open, onClose, editing }) => {
  const createPrompt = useCreateScheduledPrompt();
  const updatePrompt = useUpdateScheduledPrompt();
  const { data: workersData } = useWorkers();
  const workers = workersData?.workers ?? [];
  const [cron, setCron] = useState(editing?.cron ?? '');
  const [prompt, setPrompt] = useState(editing?.prompt ?? '');
  const [workerImage, setWorkerImage] = useState(
    editing?.workerImage ?? INHERIT_DEFAULT,
  );

  const save = async (): Promise<void> => {
    if (!cron.trim() || !prompt.trim()) return;
    // Omit workerImage entirely when inheriting the default, so we never pin a
    // stale image and the server resolves the creator's current default.
    const worker = workerImage ? { workerImage } : {};
    if (editing) {
      await updatePrompt.mutateAsync({
        id: editing.id,
        cron: cron.trim(),
        prompt: prompt.trim(),
        ...worker,
      });
    } else {
      await createPrompt.mutateAsync({
        cron: cron.trim(),
        prompt: prompt.trim(),
        enabled: true,
        ...worker,
      });
    }
    onClose();
  };

  const pending = createPrompt.isPending || updatePrompt.isPending;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {editing ? 'Edit scheduled task' : 'New scheduled task'}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          A cron-scheduled headless run. The agent chooses which configured
          repo(s) to work in.
        </Typography>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Cron (e.g. 0 9 * * *)"
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            error={Boolean(cron.trim()) && describeCron(cron) === null}
          />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {CRON_PRESETS.map((preset) => (
              <Chip
                key={preset.cron}
                label={preset.label}
                size="small"
                variant={cron.trim() === preset.cron ? 'filled' : 'outlined'}
                color={cron.trim() === preset.cron ? 'primary' : 'default'}
                onClick={() => setCron(preset.cron)}
              />
            ))}
          </Box>
          <CronPreview cron={cron} />
          <TextField
            label="Prompt"
            multiline
            minRows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <TextField
            select
            label="Worker"
            value={workerImage}
            onChange={(e) => setWorkerImage(e.target.value)}
            helperText="Which harness runs this task. Defaults to your configured worker."
          >
            <MenuItem value={INHERIT_DEFAULT}>Use my default</MenuItem>
            {workers.map((w) => (
              <MenuItem key={w.id} value={w.image}>
                {w.name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={pending}>
          {editing ? 'Save' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
