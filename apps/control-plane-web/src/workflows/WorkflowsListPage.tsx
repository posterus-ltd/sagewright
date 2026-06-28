import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import { workflowDefinitionSchema, type Workflow } from '@sagewright/shared';
import { useMemo, useState, type FC } from 'react';
import { useNavigate } from 'react-router';

import {
  useCreateWorkflow,
  useDeleteWorkflow,
  useRunWorkflow,
  useUpdateWorkflow,
  useWorkflowRuns,
  useWorkflows,
} from '../api/hooks';
import { EXAMPLE_WORKFLOW_JSON } from './example-workflow';

const RUN_STATUS_COLOR = {
  queued: 'info',
  running: 'info',
  succeeded: 'success',
  failed: 'error',
  max_iterations: 'warning',
} as const;

export const WorkflowsListPage: FC = () => {
  const navigate = useNavigate();
  const { data: workflows = [] } = useWorkflows();
  const { data: runs = [] } = useWorkflowRuns();
  const createWorkflow = useCreateWorkflow();
  const updateWorkflow = useUpdateWorkflow();
  const deleteWorkflow = useDeleteWorkflow();
  const runWorkflow = useRunWorkflow();

  const [editing, setEditing] = useState<Workflow | null>(null);
  const [json, setJson] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [runFor, setRunFor] = useState<Workflow | null>(null);
  const [runInput, setRunInput] = useState('');

  const editorOpen = json !== '' || editing !== null;

  const openNew = (): void => {
    setEditing(null);
    setJson(EXAMPLE_WORKFLOW_JSON);
    setError(null);
  };
  const openEdit = (wf: Workflow): void => {
    setEditing(wf);
    setJson(JSON.stringify(wf.definition, null, 2));
    setError(null);
  };
  const closeEditor = (): void => {
    setEditing(null);
    setJson('');
    setError(null);
  };

  const parsed = useMemo(() => {
    if (!editorOpen) return null;
    try {
      return workflowDefinitionSchema.safeParse(JSON.parse(json));
    } catch (e) {
      return { success: false as const, error: { message: (e as Error).message } };
    }
  }, [editorOpen, json]);

  const save = async (): Promise<void> => {
    if (!parsed) return;
    if (!parsed.success) {
      setError('error' in parsed ? JSON.stringify(parsed.error, null, 2) : 'Invalid JSON');
      return;
    }
    try {
      if (editing) {
        await updateWorkflow.mutateAsync({ id: editing.id, definition: parsed.data });
      } else {
        await createWorkflow.mutateAsync({ definition: parsed.data, enabled: true });
      }
      closeEditor();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const triggerRun = async (): Promise<void> => {
    if (!runFor) return;
    const run = await runWorkflow.mutateAsync({ id: runFor.id, input: runInput.trim() || undefined });
    setRunFor(null);
    setRunInput('');
    navigate(`/workflows/runs/${run.id}`);
  };

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          Workflows
        </Typography>
        <Button variant="contained" onClick={openNew}>
          New workflow
        </Button>
      </Box>

      {editorOpen && (
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            {editing ? `Edit "${editing.name}"` : 'New workflow'}
          </Typography>
          <TextField
            value={json}
            onChange={(e) => setJson(e.target.value)}
            multiline
            minRows={14}
            fullWidth
            slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontSize: 13 } } }}
          />
          {error && (
            <Typography component="pre" color="error" sx={{ mt: 1, fontSize: 12, whiteSpace: 'pre-wrap' }}>
              {error}
            </Typography>
          )}
          {parsed && !parsed.success && !error && (
            <Typography color="warning.main" sx={{ mt: 1, fontSize: 12 }}>
              Definition is not yet valid.
            </Typography>
          )}
          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            <Button variant="contained" onClick={save} disabled={!parsed?.success}>
              {editing ? 'Save' : 'Create'}
            </Button>
            <Button onClick={closeEditor}>Cancel</Button>
          </Stack>
        </Box>
      )}

      <Box>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Defined workflows
        </Typography>
        {workflows.length === 0 ? (
          <Typography color="text.secondary">No workflows yet — create one to get started.</Typography>
        ) : (
          <List disablePadding>
            {workflows.map((wf) => (
              <ListItem
                key={wf.id}
                divider
                secondaryAction={
                  <Stack direction="row" spacing={0.5}>
                    <IconButton edge="end" title="Run" onClick={() => setRunFor(wf)}>
                      <PlayArrowRounded />
                    </IconButton>
                    <IconButton edge="end" title="Delete" onClick={() => deleteWorkflow.mutate(wf.id)}>
                      <DeleteOutlineRounded />
                    </IconButton>
                  </Stack>
                }
              >
                <ListItemButton onClick={() => openEdit(wf)} sx={{ borderRadius: 1 }}>
                  <ListItemText
                    primary={wf.name}
                    secondary={`${wf.definition.steps.length} steps · trigger: ${wf.definition.trigger.type}${wf.enabled ? '' : ' · disabled'}`}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Box>

      <Divider />

      <Box>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Recent runs
        </Typography>
        {runs.length === 0 ? (
          <Typography color="text.secondary">No runs yet.</Typography>
        ) : (
          <List disablePadding>
            {runs.slice(0, 20).map((run) => (
              <ListItemButton key={run.id} onClick={() => navigate(`/workflows/runs/${run.id}`)} sx={{ borderRadius: 1 }}>
                <ListItemText
                  primary={new Date(run.createdAt).toLocaleString()}
                  secondary={run.currentStepKey ? `at step: ${run.currentStepKey}` : run.id}
                />
                <Chip label={run.status} color={RUN_STATUS_COLOR[run.status]} size="small" />
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>

      <Dialog open={Boolean(runFor)} onClose={() => setRunFor(null)} fullWidth maxWidth="sm">
        <DialogTitle>Run "{runFor?.name}"</DialogTitle>
        <DialogContent>
          <TextField
            label="Input (e.g. feature requirements) — optional"
            value={runInput}
            onChange={(e) => setRunInput(e.target.value)}
            multiline
            minRows={4}
            fullWidth
            autoFocus
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRunFor(null)}>Cancel</Button>
          <Button variant="contained" onClick={triggerRun} disabled={runWorkflow.isPending}>
            Run
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
