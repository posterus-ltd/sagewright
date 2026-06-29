import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import { workflowDefinitionSchema, type Workflow } from '@sagewright/shared';
import { useEffect, useMemo, useState, type FC } from 'react';

import { useCreateWorkflow, useUpdateWorkflow } from '../api/hooks';
import { EXAMPLE_WORKFLOW_JSON } from './example-workflow';

interface WorkflowEditorDialogProps {
  open: boolean;
  // The workflow being edited, or null to create a new one.
  workflow: Workflow | null;
  onClose: () => void;
}

// Modal JSON editor for creating or editing a workflow definition. Validates
// against the shared schema on every keystroke and only enables save once the
// definition parses cleanly.
export const WorkflowEditorDialog: FC<WorkflowEditorDialogProps> = ({
  open,
  workflow,
  onClose,
}) => {
  const createWorkflow = useCreateWorkflow();
  const updateWorkflow = useUpdateWorkflow();
  const [json, setJson] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Seed the editor each time it opens: the edited definition, or the example.
  useEffect(() => {
    if (!open) return;
    setJson(
      workflow
        ? JSON.stringify(workflow.definition, null, 2)
        : EXAMPLE_WORKFLOW_JSON,
    );
    setError(null);
  }, [open, workflow]);

  const parsed = useMemo(() => {
    try {
      return workflowDefinitionSchema.safeParse(JSON.parse(json));
    } catch (e) {
      return {
        success: false as const,
        error: { message: (e as Error).message },
      };
    }
  }, [json]);

  const save = async (): Promise<void> => {
    if (!parsed.success) {
      setError(
        'error' in parsed ? JSON.stringify(parsed.error, null, 2) : 'Invalid JSON',
      );
      return;
    }
    try {
      if (workflow) {
        await updateWorkflow.mutateAsync({
          id: workflow.id,
          definition: parsed.data,
        });
      } else {
        await createWorkflow.mutateAsync({
          definition: parsed.data,
          enabled: true,
        });
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        {workflow ? `Edit "${workflow.name}"` : 'New workflow'}
      </DialogTitle>
      <DialogContent>
        <TextField
          value={json}
          onChange={(e) => setJson(e.target.value)}
          multiline
          minRows={16}
          fullWidth
          autoFocus
          slotProps={{
            htmlInput: { style: { fontFamily: 'monospace', fontSize: 13 } },
          }}
          sx={{ mt: 1 }}
        />
        {error && (
          <Typography
            component="pre"
            color="error"
            sx={{ mt: 1, fontSize: 12, whiteSpace: 'pre-wrap' }}
          >
            {error}
          </Typography>
        )}
        {!parsed.success && !error && (
          <Typography color="warning.main" sx={{ mt: 1, fontSize: 12 }}>
            Definition is not yet valid.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={!parsed.success}>
          {workflow ? 'Save' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
