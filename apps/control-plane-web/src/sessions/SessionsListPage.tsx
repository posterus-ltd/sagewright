import Archive from '@mui/icons-material/Archive';
import DeleteForever from '@mui/icons-material/DeleteForever';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import EditRounded from '@mui/icons-material/EditRounded';
import { Box, IconButton, InputBase, Tab, Tabs, Tooltip } from '@mui/material';
import {
  DataGrid,
  type GridColDef,
  type GridRowParams,
} from '@mui/x-data-grid';
import { isTerminalStatus, taskLabel, type Task } from '@sagewright/shared';
import { DateTime } from 'luxon';
import {
  useEffect,
  useMemo,
  useState,
  type FC,
  type KeyboardEvent,
} from 'react';
import { useNavigate } from 'react-router';

import {
  useArchiveTask,
  useStopTask,
  useDeleteTask,
  useTasks,
  useUpdateTask,
} from '../api/hooks';
import { NewSessionButton } from '../components/NewSessionButton';
import { StatusChip } from '../components/StatusChip';
import { WorkerChip } from '../components/WorkerChip';

enum SessionView {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

const _1_MINUTE = 60 * 1000;

// Absolute start time, e.g. "Jun 26, 2026, 9:00 AM".
const absoluteStart = (iso: string): string =>
  DateTime.fromISO(iso).toLocaleString(DateTime.DATETIME_MED);

// Human-readable time since the session started, e.g. "3 hours ago".
const relativeStart = (iso: string): string =>
  DateTime.fromISO(iso).toRelative() ?? absoluteStart(iso);

// Shows the absolute start time; on hover a tooltip reveals the relative
// "… ago" phrasing, re-rendered each minute so it stays live while pointed at.
const StartedAtCell: FC<{ startedAt: string }> = ({ startedAt }) => {
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => tick((n) => n + 1), _1_MINUTE);
    return () => clearInterval(id);
  }, [open]);

  return (
    <Tooltip
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      title={relativeStart(startedAt)}
    >
      <span>{absoluteStart(startedAt)}</span>
    </Tooltip>
  );
};

export const SessionsListPage: FC = () => {
  const { data: tasks = [] } = useTasks(true);
  const stopTask = useStopTask();
  const archiveTask = useArchiveTask();
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();
  const navigate = useNavigate();
  const [view, setView] = useState<SessionView>(SessionView.ACTIVE);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const visible = useMemo(
    () =>
      tasks.filter((t) =>
        view === SessionView.ARCHIVED
          ? t.archivedAt !== null
          : t.archivedAt === null,
      ),
    [tasks, view],
  );

  const startRename = (t: Task): void => {
    setRenamingId(t.id);
    setDraft(t.name ?? '');
  };

  const commitRename = (t: Task): void => {
    setRenamingId(null);
    const next = draft.trim();
    if (next === (t.name ?? '')) return;
    updateTask.mutate({ id: t.id, name: next || null });
  };

  const onRenameKeyDown = (e: KeyboardEvent, t: Task): void => {
    if (e.key === 'Enter') commitRename(t);
    else if (e.key === 'Escape') setRenamingId(null);
  };

  const columns = useMemo<GridColDef<Task>[]>(
    () => [
      {
        field: 'session',
        headerName: 'Session',
        flex: 1,
        minWidth: 220,
        sortable: false,
        valueGetter: (_value, row) => taskLabel(row, 80),
        renderCell: (params) =>
          renamingId === params.row.id ? (
            <InputBase
              autoFocus
              fullWidth
              value={draft}
              placeholder={
                params.row.prompt
                  ? params.row.prompt.slice(0, 80)
                  : 'Session name'
              }
              // Editing must not trigger the row's navigate-on-click.
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commitRename(params.row)}
              onKeyDown={(e) => onRenameKeyDown(e, params.row)}
              inputProps={{ 'aria-label': 'Session name', maxLength: 200 }}
            />
          ) : (
            taskLabel(params.row, 80)
          ),
      },
      {
        field: 'worker',
        headerName: 'Worker',
        width: 160,
        sortable: false,
        renderCell: (params) => <WorkerChip image={params.row.workerImage} />,
      },
      {
        field: 'status',
        headerName: 'Status',
        width: 150,
        renderCell: (params) => <StatusChip status={params.row.status} />,
      },
      {
        field: 'createdAt',
        headerName: 'Started',
        width: 180,
        valueGetter: (_value, row) => new Date(row.createdAt),
        renderCell: (params) => (
          <StartedAtCell startedAt={params.row.createdAt} />
        ),
      },
      {
        field: 'actions',
        headerName: '',
        width: 100,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        align: 'right',
        renderCell: (params) => {
          const t = params.row;
          return (
            <Box
              className="row-actions"
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                height: '100%',
                gap: 0.25,
              }}
            >
              {view !== SessionView.ARCHIVED && (
                <Tooltip title="Rename">
                  <IconButton
                    size="small"
                    aria-label="Rename session"
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(t);
                    }}
                  >
                    <EditRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {view === SessionView.ARCHIVED ? (
                <Tooltip title="Delete permanently">
                  <IconButton
                    size="small"
                    aria-label="Delete session"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTask.mutate(t.id);
                    }}
                  >
                    <DeleteForever fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : isTerminalStatus(t.status) ? (
                <Tooltip title="Archive">
                  <IconButton
                    size="small"
                    aria-label="Archive session"
                    onClick={(e) => {
                      e.stopPropagation();
                      archiveTask.mutate(t.id);
                    }}
                  >
                    <Archive fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : (
                <Tooltip title="Stop">
                  <IconButton
                    size="small"
                    aria-label="Stop session"
                    onClick={(e) => {
                      e.stopPropagation();
                      stopTask.mutate(t.id);
                    }}
                  >
                    <StopCircleIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, renamingId, draft, archiveTask, stopTask, deleteTask],
  );

  // Clicking a row opens the session, except while renaming it inline.
  const onRowClick = (params: GridRowParams<Task>): void => {
    if (renamingId === params.row.id) return;
    navigate(`/tasks/${params.row.id}`);
  };

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2,
        }}
      >
        <Tabs value={view} onChange={(_, v: SessionView) => setView(v)}>
          <Tab label="Active" value={SessionView.ACTIVE} />
          <Tab label="Archived" value={SessionView.ARCHIVED} />
        </Tabs>
        <NewSessionButton onCreated={(task) => navigate(`/tasks/${task.id}`)} />
      </Box>
      <DataGrid
        rows={visible}
        columns={columns}
        autoHeight
        disableVirtualization
        disableRowSelectionOnClick
        onRowClick={onRowClick}
        pageSizeOptions={[25, 50, 100]}
        sx={{
          '& .MuiDataGrid-row': { cursor: 'pointer' },
          // Reveal row actions only on hover/focus.
          '& .row-actions': { opacity: 0, transition: 'opacity 0.15s' },
          '& .MuiDataGrid-row:hover .row-actions, & .MuiDataGrid-row:focus-within .row-actions':
            { opacity: 1 },
        }}
      />
    </Box>
  );
};
