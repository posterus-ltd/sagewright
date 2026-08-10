import BuildRounded from '@mui/icons-material/BuildRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import KeyboardReturnRounded from '@mui/icons-material/KeyboardReturnRounded';
import LoopRounded from '@mui/icons-material/LoopRounded';
import SmartToyRounded from '@mui/icons-material/SmartToyRounded';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  WorkflowStepKind,
  type RunnerImage,
  type WorkflowStep,
} from '@sagewright/shared';
import { useState, type FC } from 'react';

import { commandsToText, textToCommands } from './workflow-builder';

const LOOP_BACK_TO_STEP_ONE = '__loop_back_to_step_one__';

interface WorkflowStepCardProps {
  step: WorkflowStep;
  index: number;
  // Every other step in the definition — candidates for this step's loop-back target.
  otherSteps: WorkflowStep[];
  runners: RunnerImage[];
  fieldErrors: Record<string, string>;
  onChange: (patch: Partial<WorkflowStep>) => void;
  onKindChange: (kind: WorkflowStepKind) => void;
  onDelete: () => void;
}

// A small, non-interactive icon + tooltip — the "sparse" alternative to a text
// chip for previewing a collapsed step's runner/kind/loop-back target at a glance.
const MetaIcon: FC<{ title: string; testId: string; children: React.ReactNode }> = ({
  title,
  testId,
  children,
}) => (
  <Tooltip title={title}>
    <Box
      component="span"
      data-testid={testId}
      sx={{ display: 'inline-flex', color: 'text.secondary' }}
    >
      {children}
    </Box>
  </Tooltip>
);

export const WorkflowStepCard: FC<WorkflowStepCardProps> = ({
  step,
  index,
  otherSteps,
  runners,
  fieldErrors,
  onChange,
  onKindChange,
  onDelete,
}) => {
  const [expanded, setExpanded] = useState(false);
  const isLoopBack = step.kind === WorkflowStepKind.VALIDATION;
  const runnerName =
    runners.find((w) => w.image === step.runnerImage)?.name || step.runnerImage;
  const loopTargetName = step.onFailureGoTo
    ? (otherSteps.find((s) => s.key === step.onFailureGoTo)?.name ?? step.onFailureGoTo)
    : 'step 1 (default)';

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, next) => setExpanded(next)}
      disableGutters
      slotProps={{ transition: { unmountOnExit: true } }}
      data-testid={`workflow-step-${index}`}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        '&::before': { display: 'none' },
        '& .step-delete-action': { opacity: 0, transition: 'opacity 0.15s' },
        '&:hover .step-delete-action, &:focus-within .step-delete-action': {
          opacity: 1,
        },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreRounded />}
        aria-label={`Toggle step ${index + 1}`}
      >
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ alignItems: 'center', flex: 1, minWidth: 0, mr: 1 }}
        >
          <Typography noWrap sx={{ fontWeight: 600 }}>
            {step.name || `Step ${index + 1}`}
          </Typography>
          <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
            <MetaIcon
              title={isLoopBack ? 'Loop-back check' : 'Work step'}
              testId="step-kind-icon"
            >
              {isLoopBack ? (
                <LoopRounded fontSize="small" />
              ) : (
                <BuildRounded fontSize="small" />
              )}
            </MetaIcon>
            <MetaIcon title={runnerName} testId="step-runner-icon">
              <SmartToyRounded fontSize="small" />
            </MetaIcon>
            {isLoopBack && (
              <MetaIcon
                title={`Loops back to "${loopTargetName}"`}
                testId="step-loop-icon"
              >
                <KeyboardReturnRounded fontSize="small" />
              </MetaIcon>
            )}
          </Stack>
        </Stack>
        <IconButton
          className="step-delete-action"
          aria-label={`Delete step ${index + 1}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          size="small"
        >
          <DeleteOutlineRounded fontSize="small" />
        </IconButton>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Name"
              value={step.name}
              onChange={(e) => onChange({ name: e.target.value })}
              error={Boolean(fieldErrors.name)}
              helperText={fieldErrors.name}
              fullWidth
            />
            <TextField
              select
              label="Runner"
              value={step.runnerImage}
              onChange={(e) => onChange({ runnerImage: e.target.value })}
              error={Boolean(fieldErrors.runnerImage)}
              helperText={fieldErrors.runnerImage}
              fullWidth
            >
              {runners.map((w) => (
                <MenuItem key={w.id} value={w.image}>
                  {w.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField
            label="Prompt"
            value={step.goal}
            onChange={(e) => onChange({ goal: e.target.value })}
            error={Boolean(fieldErrors.goal)}
            helperText={fieldErrors.goal}
            multiline
            minRows={2}
            fullWidth
          />
          <ToggleButtonGroup
            exclusive
            value={step.kind}
            onChange={(_, value: WorkflowStepKind | null) =>
              value && onKindChange(value)
            }
            aria-label="Step type"
            size="small"
          >
            <ToggleButton value={WorkflowStepKind.WORK}>Work step</ToggleButton>
            <ToggleButton value={WorkflowStepKind.VALIDATION}>
              Loop-back check
            </ToggleButton>
          </ToggleButtonGroup>
          {isLoopBack && (
            <>
              <TextField
                select
                label="Loop back to"
                value={step.onFailureGoTo ?? LOOP_BACK_TO_STEP_ONE}
                onChange={(e) =>
                  onChange({
                    onFailureGoTo:
                      e.target.value === LOOP_BACK_TO_STEP_ONE
                        ? undefined
                        : e.target.value,
                  })
                }
                error={Boolean(fieldErrors.onFailureGoTo)}
                helperText={fieldErrors.onFailureGoTo}
                slotProps={{ select: { displayEmpty: true } }}
                fullWidth
              >
                <MenuItem value={LOOP_BACK_TO_STEP_ONE}>
                  Restart from step 1 (default)
                </MenuItem>
                {otherSteps.map((s) => (
                  <MenuItem key={s.key} value={s.key}>
                    {s.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Validate commands"
                value={commandsToText(step.validateCommands)}
                onChange={(e) =>
                  onChange({ validateCommands: textToCommands(e.target.value) })
                }
                helperText="One shell command per line; all must exit 0 to pass."
                multiline
                minRows={2}
                fullWidth
              />
            </>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
};
