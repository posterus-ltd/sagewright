import Archive from '@mui/icons-material/Archive';
import DeleteForever from '@mui/icons-material/DeleteForever';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import EditRounded from '@mui/icons-material/EditRounded';
import { Box, IconButton, InputBase, Tooltip } from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import { isTerminalStatus, sessionLabel, type Session } from '@sagewright/shared';
import { DateTime } from 'luxon';
import { useEffect, useState, type FC, type KeyboardEvent } from 'react';

import { StatusChip } from '../components/StatusChip';
import { RunnerChip } from '../components/RunnerChip';
import { SessionTags } from '../components/SessionTags';
import { Stack } from '@mui/material';

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

export interface SessionListColumnsParams {
  isArchivedView: boolean;
  // Whether this build allows permanent deletion at all — compiled to false
  // on audit-retention deployments, where the delete action is not rendered.
  canDelete: boolean;
  // Whether the current user is allowed to rename/stop/archive/delete this
  // session — false for other users' rows when viewing "All" scope.
  canActOn: (session: Session) => boolean;
  renamingId: string | null;
  draft: string;
  onDraftChange: (value: string) => void;
  onStartRename: (session: Session) => void;
  onCommitRename: (session: Session) => void;
  onRenameKeyDown: (e: KeyboardEvent, session: Session) => void;
  onStop: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}

export const buildSessionColumns = ({
  isArchivedView,
  canDelete,
  canActOn,
  renamingId,
  draft,
  onDraftChange,
  onStartRename,
  onCommitRename,
  onRenameKeyDown,
  onStop,
  onArchive,
  onDelete,
}: SessionListColumnsParams): GridColDef<Session>[] => [
  {
    field: 'session',
    headerName: 'Session',
    flex: 1,
    minWidth: 220,
    sortable: false,
    valueGetter: (_value, row) => sessionLabel(row, 80),
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
          onChange={(e) => onDraftChange(e.target.value)}
          onBlur={() => onCommitRename(params.row)}
          onKeyDown={(e) => onRenameKeyDown(e, params.row)}
          inputProps={{ 'aria-label': 'Session name', maxLength: 200 }}
        />
      ) : (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Box
            sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {sessionLabel(params.row, 80)}
          </Box>
          <SessionTags session={params.row} />
        </Stack>
      ),
  },
  {
    field: 'createdByName',
    headerName: 'Owner',
    width: 140,
    valueGetter: (_v, row) => row.createdByName ?? '—',
  },
  {
    field: 'runner',
    headerName: 'Runner',
    width: 160,
    sortable: false,
    renderCell: (params) => <RunnerChip image={params.row.runnerImage} />,
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
      const canAct = canActOn(t);
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
          {canAct && !isArchivedView && (
            <Tooltip title="Rename">
              <IconButton
                size="small"
                aria-label="Rename session"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartRename(t);
                }}
              >
                <EditRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {canAct &&
            (isArchivedView ? (
              canDelete && (
                <Tooltip title="Delete permanently">
                  <IconButton
                    size="small"
                    aria-label="Delete session"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(t.id);
                    }}
                  >
                    <DeleteForever fontSize="small" />
                  </IconButton>
                </Tooltip>
              )
            ) : isTerminalStatus(t.status) ? (
              <Tooltip title="Archive">
                <IconButton
                  size="small"
                  aria-label="Archive session"
                  onClick={(e) => {
                    e.stopPropagation();
                    onArchive(t.id);
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
                    onStop(t.id);
                  }}
                >
                  <StopCircleIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ))}
        </Box>
      );
    },
  },
];
