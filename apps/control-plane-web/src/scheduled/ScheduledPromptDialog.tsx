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
import { type ScheduledPrompt } from '@sagewright/shared';
import { useState, type FC } from 'react';

import {
  useCreateScheduledPrompt,
  useUpdateScheduledPrompt,
  useWorkers,
} from '../api/hooks';
import { CronEditor } from '../components/CronEditor';

// Sentinel for the worker <Select>: empty value means "inherit my default worker"
// (resolved server-side at fire time), distinct from any real image ref.
const INHERIT_DEFAULT = '';

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
          <CronEditor value={cron} onChange={setCron} />
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
