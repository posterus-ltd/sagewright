import { Box, Chip, Stack, TextField, Typography } from '@mui/material';
import { Cron } from 'croner';
import cronstrue from 'cronstrue';
import type { FC } from 'react';

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

interface CronEditorProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  error?: boolean;
  helperText?: string;
}

// A cron expression field with preset shortcuts and a human-readable preview
// (description + next runs) — shared by anything that schedules on a cron.
export const CronEditor: FC<CronEditorProps> = ({
  value,
  onChange,
  label = 'Cron (e.g. 0 9 * * *)',
  error,
  helperText,
}) => (
  <Stack spacing={1.5}>
    <TextField
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error || (Boolean(value.trim()) && describeCron(value) === null)}
      helperText={helperText}
      fullWidth
    />
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {CRON_PRESETS.map((preset) => (
        <Chip
          key={preset.cron}
          label={preset.label}
          size="small"
          variant={value.trim() === preset.cron ? 'filled' : 'outlined'}
          color={value.trim() === preset.cron ? 'primary' : 'default'}
          onClick={() => onChange(preset.cron)}
        />
      ))}
    </Box>
    <CronPreview cron={value} />
  </Stack>
);
