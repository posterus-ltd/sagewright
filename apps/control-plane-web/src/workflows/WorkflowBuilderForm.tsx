import { Alert, MenuItem, Stack, TextField, Typography } from '@mui/material';
import type { WorkflowDefinition, WorkflowTrigger } from '@sagewright/shared';
import type { FC } from 'react';

import { CronEditor } from '../components/CronEditor';
import { issueAt, topLevelIssues, type WorkflowIssue } from './workflow-builder';
import { WorkflowStepList } from './WorkflowStepList';

interface WorkflowBuilderFormProps {
  draft: WorkflowDefinition;
  issues: WorkflowIssue[];
  onChange: (next: WorkflowDefinition) => void;
}

export const WorkflowBuilderForm: FC<WorkflowBuilderFormProps> = ({
  draft,
  issues,
  onChange,
}) => {
  const banners = topLevelIssues(issues);

  return (
    <Stack spacing={2} sx={{ mt: 2 }}>
      {banners.length > 0 && (
        <Alert severity="error">
          {banners.map((message) => (
            <Typography key={message} variant="body2">
              {message}
            </Typography>
          ))}
        </Alert>
      )}
      <Stack direction="row" spacing={2}>
        <TextField
          label="Workflow name"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          error={Boolean(issueAt(issues, ['name']))}
          helperText={issueAt(issues, ['name'])}
          fullWidth
        />
        <TextField
          label="Max iterations"
          type="number"
          value={draft.maxIterations}
          onChange={(e) =>
            onChange({ ...draft, maxIterations: Number(e.target.value) })
          }
          error={Boolean(issueAt(issues, ['maxIterations']))}
          helperText={issueAt(issues, ['maxIterations'])}
          sx={{ minWidth: 160 }}
        />
      </Stack>
      <TextField
        select
        label="Trigger"
        value={draft.trigger.type}
        onChange={(e) =>
          onChange({
            ...draft,
            trigger: (e.target.value === 'cron'
              ? { type: 'cron', cron: draft.trigger.cron ?? '' }
              : { type: 'manual' }) as WorkflowTrigger,
          })
        }
        sx={{ minWidth: 160 }}
      >
        <MenuItem value="manual">Manual</MenuItem>
        <MenuItem value="cron">Cron</MenuItem>
      </TextField>
      {draft.trigger.type === 'cron' && (
        <CronEditor
          label="Cron expression"
          value={draft.trigger.cron ?? ''}
          onChange={(cron) =>
            onChange({
              ...draft,
              trigger: { type: 'cron', cron } as WorkflowTrigger,
            })
          }
          error={Boolean(issueAt(issues, ['trigger', 'cron']))}
          helperText={issueAt(issues, ['trigger', 'cron'])}
        />
      )}
      <WorkflowStepList
        steps={draft.steps}
        issues={issues}
        onChange={(steps) => onChange({ ...draft, steps })}
      />
    </Stack>
  );
};
