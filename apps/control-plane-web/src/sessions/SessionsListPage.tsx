import { Stack } from '@mui/material';
import { DataGrid, type GridRowParams } from '@mui/x-data-grid';
import { SessionOrigin, type Session } from '@sagewright/shared';
import { useMemo, useState, type FC, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';

import {
  useArchiveTask,
  useDeleteTask,
  useStopTask,
  useTasks,
  useUpdateTask,
} from '../api/hooks';
import { useAuth } from '../auth/useAuth';
import { Header } from '../components/Header';
import { MainContainer } from '../components/MainContainer';
import { NewSessionButton } from '../components/NewSessionButton';
import { ResponsiveToggle } from '../components/ResponsiveToggle';
import { buildSessionColumns } from './session-list-columns';

enum SessionView {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

enum SessionScope {
  MINE = 'mine',
  DELEGATED = 'delegated',
  ALL = 'all',
}

export const SessionsListPage: FC = () => {
  const [scope, setScope] = useState<SessionScope>(SessionScope.MINE);
  // MINE and DELEGATED both list the user's own sessions (DELEGATED narrows to
  // agent-spawned ones client-side); ALL lists everyone's.
  const { data: tasks = [] } = useTasks(scope !== SessionScope.ALL);
  const { userId } = useAuth();
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
      tasks
        .filter((t) =>
          view === SessionView.ARCHIVED
            ? t.archivedAt !== null
            : t.archivedAt === null,
        )
        .filter(
          (t) =>
            scope !== SessionScope.DELEGATED ||
            t.origin === SessionOrigin.AGENT,
        ),
    [tasks, view, scope],
  );

  const startRename = (t: Session): void => {
    setRenamingId(t.id);
    setDraft(t.name ?? '');
  };

  const commitRename = (t: Session): void => {
    setRenamingId(null);
    const next = draft.trim();
    if (next === (t.name ?? '')) return;
    updateTask.mutate({ id: t.id, name: next || null });
  };

  const onRenameKeyDown = (e: KeyboardEvent, t: Session): void => {
    if (e.key === 'Enter') commitRename(t);
    else if (e.key === 'Escape') setRenamingId(null);
  };

  // Other users' sessions are read-only in "All" scope — the API rejects
  // mutating a session you don't own.
  const canActOn = (t: Session): boolean =>
    scope === SessionScope.MINE || t.createdBy === userId;

  // Baked in at build time: audit-retention deployments build the web bundle
  // with VITE_ALLOW_SESSION_DELETION=false to drop the permanent-delete action
  // (the API refuses the call regardless, via ALLOW_SESSION_DELETION).
  const canDelete = import.meta.env.VITE_ALLOW_SESSION_DELETION !== 'false';

  const columns = useMemo(
    () =>
      buildSessionColumns({
        isArchivedView: view === SessionView.ARCHIVED,
        canDelete,
        canActOn,
        renamingId,
        draft,
        onDraftChange: setDraft,
        onStartRename: startRename,
        onCommitRename: commitRename,
        onRenameKeyDown,
        onStop: stopTask.mutate,
        onArchive: archiveTask.mutate,
        onDelete: deleteTask.mutate,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, scope, userId, renamingId, draft, archiveTask, stopTask, deleteTask],
  );

  // Clicking a row opens the session, except while renaming it inline.
  const onRowClick = (params: GridRowParams<Session>): void => {
    if (renamingId === params.row.id) return;
    navigate(`/tasks/${params.row.id}`);
  };

  return (
    <MainContainer>
      <Stack spacing={3}>
        <Header
          title={
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <ResponsiveToggle
                value={view}
                enumType={SessionView}
                enumName="SessionView"
                onChange={setView}
                ariaLabel="Session view"
              />
              <ResponsiveToggle
                value={scope}
                enumType={SessionScope}
                enumName="SessionScope"
                onChange={setScope}
                ariaLabel="Session scope"
              />
            </Stack>
          }
          actions={
            <NewSessionButton
              onCreated={(task) => navigate(`/tasks/${task.id}`)}
            />
          }
        />
        <DataGrid
          rows={visible}
          columns={columns}
          columnVisibilityModel={{ createdByName: scope === SessionScope.ALL }}
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
      </Stack>
    </MainContainer>
  );
};
