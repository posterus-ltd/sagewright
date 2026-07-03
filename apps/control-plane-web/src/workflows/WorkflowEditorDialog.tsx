import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  workflowDefinitionSchema,
  type Workflow,
  type WorkflowDefinition,
} from '@sagewright/shared';
import { useEffect, useMemo, useState, type FC } from 'react';

import { useCreateWorkflow, useUpdateWorkflow } from '../api/hooks';
import { EXAMPLE_WORKFLOW } from './example-workflow';
import { WorkflowBuilderForm } from './WorkflowBuilderForm';
import type { WorkflowIssue } from './workflow-builder';

enum WorkflowEditorMode {
  BUILDER = 'builder',
  JSON = 'json',
}

interface WorkflowEditorDialogProps {
  open: boolean;
  // The workflow being edited, or null to create a new one.
  workflow: Workflow | null;
  onClose: () => void;
}

// Dual-mode create/edit dialog: a structured step-by-step Builder view and a raw
// JSON view for advanced usage, both reading from and writing to one `draft`
// definition so neither view can silently drift out of sync with the other.
export const WorkflowEditorDialog: FC<WorkflowEditorDialogProps> = ({
  open,
  workflow,
  onClose,
}) => {
  const createWorkflow = useCreateWorkflow();
  const updateWorkflow = useUpdateWorkflow();
  const [draft, setDraft] = useState<WorkflowDefinition>(EXAMPLE_WORKFLOW);
  const [mode, setMode] = useState(WorkflowEditorMode.BUILDER);
  const [jsonText, setJsonText] = useState('');
  const [jsonSyntaxError, setJsonSyntaxError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Seed the editor each time it opens: the edited definition, or the example.
  useEffect(() => {
    if (!open) return;
    const seed = workflow ? workflow.definition : structuredClone(EXAMPLE_WORKFLOW);
    setDraft(seed);
    setJsonText(JSON.stringify(seed, null, 2));
    setMode(WorkflowEditorMode.BUILDER);
    setJsonSyntaxError(null);
    setSaveError(null);
  }, [open, workflow]);

  const parsed = useMemo(
    () => workflowDefinitionSchema.safeParse(draft),
    [draft],
  );
  const issues: WorkflowIssue[] = parsed.success ? [] : parsed.error.issues;

  // The JSON textarea keeps typing locally; it only writes into `draft` once the
  // text parses, so a broken paste never overwrites otherwise-good state.
  const onJsonChange = (text: string): void => {
    setJsonText(text);
    try {
      setDraft(JSON.parse(text));
      setJsonSyntaxError(null);
    } catch (e) {
      setJsonSyntaxError((e as Error).message);
    }
  };

  const onModeChange = (next: WorkflowEditorMode): void => {
    if (next === WorkflowEditorMode.JSON) {
      setJsonText(JSON.stringify(draft, null, 2));
    }
    setMode(next);
  };

  const save = async (): Promise<void> => {
    if (!parsed.success) return;
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
      setSaveError((e as Error).message);
    }
  };

  // Discard in-flight JSON syntax errors when saving from JSON mode: `draft` was
  // never updated with the broken text, so saving it would silently drop edits.
  const saveDisabled =
    !parsed.success ||
    (mode === WorkflowEditorMode.JSON && jsonSyntaxError !== null);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        {workflow ? `Edit "${workflow.name}"` : 'New workflow'}
      </DialogTitle>
      <DialogContent>
        <Tabs value={mode} onChange={(_, v: WorkflowEditorMode) => onModeChange(v)}>
          <Tab
            label="Builder"
            value={WorkflowEditorMode.BUILDER}
            disabled={jsonSyntaxError !== null}
          />
          <Tab label="JSON" value={WorkflowEditorMode.JSON} />
        </Tabs>

        {mode === WorkflowEditorMode.BUILDER ? (
          <WorkflowBuilderForm draft={draft} issues={issues} onChange={setDraft} />
        ) : (
          <>
            <TextField
              label="Workflow JSON"
              value={jsonText}
              onChange={(e) => onJsonChange(e.target.value)}
              multiline
              minRows={16}
              fullWidth
              autoFocus
              slotProps={{
                htmlInput: { style: { fontFamily: 'monospace', fontSize: 13 } },
              }}
              sx={{ mt: 2 }}
            />
            {jsonSyntaxError && (
              <Typography
                component="pre"
                color="error"
                sx={{ mt: 1, fontSize: 12, whiteSpace: 'pre-wrap' }}
              >
                {jsonSyntaxError}
              </Typography>
            )}
            {!jsonSyntaxError && !parsed.success && (
              <Typography
                component="pre"
                color="error"
                sx={{ mt: 1, fontSize: 12, whiteSpace: 'pre-wrap' }}
              >
                {JSON.stringify(parsed.error, null, 2)}
              </Typography>
            )}
            {jsonSyntaxError !== null && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 1, display: 'block' }}
              >
                Fix the JSON syntax to switch back to the builder.
              </Typography>
            )}
          </>
        )}

        {saveError && (
          <Typography color="error" sx={{ mt: 1, fontSize: 12 }}>
            {saveError}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saveDisabled}>
          {workflow ? 'Save' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
