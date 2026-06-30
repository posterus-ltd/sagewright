import {
  Box,
  Button,
  IconButton,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { type ScheduledPrompt } from '@sagewright/shared';
import { Cron } from 'croner';
import { DateTime } from 'luxon';
import { useEffect, useMemo, useState, type FC } from 'react';

import { Header } from '../components/Header';
import { MainContainer } from '../components/MainContainer';
import { WorkerChip } from '../components/WorkerChip';
import {
  useDeleteScheduledPrompt,
  useScheduledPrompts,
  useUpdateScheduledPrompt,
} from '../api/hooks';
import { ScheduledPromptDialog, describeCron } from './ScheduledPromptDialog';

const NO_NEXT_RUN = '—';

// The next fire time for a cron, computed client-side (the model has no such
// field). `now` is injectable so the relative phrasing is testable.
export const nextRunAt = (
  cron: string,
  now: Date = new Date(),
): Date | null => {
  const trimmed = cron.trim();
  if (!trimmed) return null;
  try {
    return new Cron(trimmed).nextRun(now);
  } catch {
    return null;
  }
};

// Human-readable time until the next run, e.g. "in 3 hours" / "in 2 days".
export const relativeToNextRun = (
  cron: string,
  now: Date = new Date(),
): string => {
  const next = nextRunAt(cron, now);
  if (!next) return NO_NEXT_RUN;
  return (
    DateTime.fromJSDate(next).toRelative({ base: DateTime.fromJSDate(now) }) ??
    NO_NEXT_RUN
  );
};

// The next fire time as a concrete date/time, e.g. "Jun 26, 2026, 9:00 AM".
export const absoluteNextRun = (
  cron: string,
  now: Date = new Date(),
): string => {
  const next = nextRunAt(cron, now);
  if (!next) return NO_NEXT_RUN;
  return DateTime.fromJSDate(next).toLocaleString(DateTime.DATETIME_MED);
};

const _10_SECONDS = 10 * 1000;

// Shows the absolute next-run time; on hover a tooltip reveals the relative
// countdown, re-rendered every second so it stays live while pointed at.
const NextRunCell: FC<{ cron: string }> = ({ cron }) => {
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => tick((n) => n + 1), _10_SECONDS);
    return () => clearInterval(id);
  }, [open]);

  const absolute = absoluteNextRun(cron);
  if (absolute === NO_NEXT_RUN) return <>{NO_NEXT_RUN}</>;

  return (
    <Tooltip
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      title={relativeToNextRun(cron)}
    >
      <span>{absolute}</span>
    </Tooltip>
  );
};

// A switch that enables/disables the schedule. Disabled prompts are skipped by
// the backend scheduler, so this is a live on/off control, not a draft flag. We
// reflect server state via query invalidation rather than flipping optimistically;
// the switch is held disabled while the update is in flight to block double-clicks.
const StatusCell: FC<{ id: string; enabled: boolean }> = ({ id, enabled }) => {
  const update = useUpdateScheduledPrompt();
  return (
    <Switch
      size="small"
      checked={enabled}
      disabled={update.isPending}
      slotProps={{ input: { role: 'switch', 'aria-label': `toggle ${id}` } }}
      onChange={() => void update.mutateAsync({ id, enabled: !enabled })}
    />
  );
};

export const ScheduledPromptsPage: FC = () => {
  const { data: prompts = [] } = useScheduledPrompts();
  const deletePrompt = useDeleteScheduledPrompt();
  // null = closed, 'new' = create dialog, a prompt = edit that task.
  const [editing, setEditing] = useState<ScheduledPrompt | 'new' | null>(null);

  const columns = useMemo<GridColDef<ScheduledPrompt>[]>(
    () => [
      {
        field: 'schedule',
        headerName: 'Schedule',
        flex: 1,
        minWidth: 180,
        valueGetter: (_value, row) => describeCron(row.cron) ?? row.cron,
      },
      { field: 'cron', headerName: 'Cron', width: 140 },
      { field: 'prompt', headerName: 'Prompt', flex: 2, minWidth: 220 },
      {
        field: 'worker',
        headerName: 'Worker',
        width: 140,
        sortable: false,
        // Empty when inheriting the creator's default worker.
        renderCell: (params) => <WorkerChip image={params.row.workerImage} />,
      },
      {
        field: 'nextRun',
        headerName: 'Next run',
        width: 190,
        // Sort by the actual timestamp, not the formatted string.
        valueGetter: (_value, row) =>
          nextRunAt(row.cron)?.getTime() ?? Infinity,
        renderCell: (params) => <NextRunCell cron={params.row.cron} />,
      },
      {
        field: 'status',
        headerName: 'Enabled',
        width: 100,
        filterable: false,
        disableColumnMenu: true,
        // Sort by the underlying flag, not the rendered switch.
        valueGetter: (_value, row) => row.enabled,
        renderCell: (params) => (
          <StatusCell id={params.row.id} enabled={params.row.enabled} />
        ),
      },
      {
        field: 'actions',
        headerName: '',
        width: 110,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        align: 'right',
        renderCell: (params) => (
          <Box className="row-actions">
            <Tooltip title="Edit">
              <IconButton
                size="small"
                aria-label={`edit ${params.row.id}`}
                onClick={() => setEditing(params.row)}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton
                size="small"
                aria-label={`delete ${params.row.id}`}
                onClick={() => void deletePrompt.mutateAsync(params.row.id)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        ),
      },
    ],
    [deletePrompt],
  );

  return (
    <MainContainer>
      <Stack spacing={3}>
        <Header
          title="Scheduled tasks"
          actions={
            <Button variant="contained" onClick={() => setEditing('new')}>
              New Session
            </Button>
          }
        />
        {prompts.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No scheduled tasks yet.
          </Typography>
        ) : (
          <DataGrid
            rows={prompts}
            columns={columns}
            autoHeight
            // Small admin list — render everything so the grid stays simple and testable.
            disableVirtualization
            disableRowSelectionOnClick
            // Dim disabled schedules so the active ones stand out at a glance.
            getRowClassName={(params) => (params.row.enabled ? '' : 'disabled')}
            initialState={{
              sorting: { sortModel: [{ field: 'nextRun', sort: 'asc' }] },
            }}
            pageSizeOptions={[25, 50, 100]}
            sx={{
              // Dim disabled rows, but keep the status switch fully legible/clickable.
              '& .MuiDataGrid-row.disabled': { opacity: 0.5 },
              '& .MuiDataGrid-row.disabled [data-field="status"]': {
                opacity: 1,
              },
              // Reveal the row actions only while the row is hovered or focused.
              '& .row-actions': { opacity: 0, transition: 'opacity 0.15s' },
              '& .MuiDataGrid-row:hover .row-actions, & .MuiDataGrid-row:focus-within .row-actions':
                {
                  opacity: 1,
                },
            }}
          />
        )}
      </Stack>
      {editing && (
        <ScheduledPromptDialog
          key={editing === 'new' ? 'new' : editing.id}
          open
          editing={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </MainContainer>
  );
};
