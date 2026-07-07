import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
} from '@mui/material';
import {
  DataGrid,
  type GridColDef,
  type GridRowParams,
} from '@mui/x-data-grid';
import { type Workflow, type WorkflowRun } from '@sagewright/shared';
import { DateTime } from 'luxon';
import { useMemo, useState, type FC } from 'react';
import { useNavigate } from 'react-router';

import {
  useDeleteWorkflow,
  useRunWorkflow,
  useWorkflowRuns,
  useWorkflows,
} from '../api/hooks';
import { ButtonType, useConfirmation } from '../components/ConfirmDialogProvider';
import { Header } from '../components/Header';
import { MainContainer } from '../components/MainContainer';
import { StatusChip } from '../components/StatusChip';
import { WorkflowEditorDialog } from './WorkflowEditorDialog';

enum WorkflowsView {
  CONFIG = 'config',
  RUNS = 'runs',
}

const formatTime = (iso: string): string =>
  DateTime.fromISO(iso).toLocaleString(DateTime.DATETIME_MED);

// Reveal row actions only on hover/focus — mirrors the Sessions grid.
const ROW_ACTIONS_SX = {
  '& .MuiDataGrid-row': { cursor: 'pointer' },
  '& .row-actions': { opacity: 0, transition: 'opacity 0.15s' },
  '& .MuiDataGrid-row:hover .row-actions, & .MuiDataGrid-row:focus-within .row-actions':
    { opacity: 1 },
} as const;

export const WorkflowsListPage: FC = () => {
  const navigate = useNavigate();
  const { confirm } = useConfirmation();
  const { data: workflows = [] } = useWorkflows();
  const { data: runs = [] } = useWorkflowRuns();
  const deleteWorkflow = useDeleteWorkflow();
  const runWorkflow = useRunWorkflow();

  const [view, setView] = useState<WorkflowsView>(WorkflowsView.CONFIG);
  // `null` = editor closed; otherwise the workflow to edit (or null inside to
  // signal "create new"). We wrap in an object so "create" stays distinct.
  const [editing, setEditing] = useState<{ workflow: Workflow | null } | null>(
    null,
  );
  const [runFor, setRunFor] = useState<Workflow | null>(null);
  const [runInput, setRunInput] = useState('');

  const workflowNameById = useMemo(
    () => new Map(workflows.map((wf) => [wf.id, wf.name])),
    [workflows],
  );

  const requestDelete = (wf: Workflow): void => {
    confirm({
      title: `Delete "${wf.name}"?`,
      content:
        'This permanently removes the workflow definition. This cannot be undone.',
      buttons: [
        { label: 'Cancel' },
        {
          label: 'Delete',
          type: ButtonType.DANGER,
          onClick: () => deleteWorkflow.mutate(wf.id),
        },
      ],
    });
  };

  const triggerRun = async (): Promise<void> => {
    if (!runFor) return;
    const run = await runWorkflow.mutateAsync({
      id: runFor.id,
      input: runInput.trim() || undefined,
    });
    setRunFor(null);
    setRunInput('');
    navigate(`/workflows/runs/${run.id}`);
  };

  const workflowColumns = useMemo<GridColDef<Workflow>[]>(
    () => [
      {
        field: 'name',
        headerName: 'Workflow',
        flex: 1,
        minWidth: 220,
        sortable: false,
      },
      {
        field: 'steps',
        headerName: 'Steps',
        width: 90,
        sortable: false,
        valueGetter: (_value, row) => row.definition.steps.length,
      },
      {
        field: 'trigger',
        headerName: 'Trigger',
        width: 120,
        sortable: false,
        valueGetter: (_value, row) => row.definition.trigger.type,
      },
      {
        field: 'enabled',
        headerName: 'Status',
        width: 120,
        renderCell: (params) => (
          <Chip
            label={params.row.enabled ? 'enabled' : 'disabled'}
            color={params.row.enabled ? 'success' : 'default'}
            size="small"
            variant={params.row.enabled ? 'filled' : 'outlined'}
          />
        ),
      },
      {
        field: 'actions',
        headerName: '',
        width: 130,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        align: 'right',
        renderCell: (params) => {
          const wf = params.row;
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
              <Tooltip title="Edit">
                <IconButton
                  size="small"
                  aria-label="Edit workflow"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing({ workflow: wf });
                  }}
                >
                  <EditRounded fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Run">
                <IconButton
                  size="small"
                  aria-label="Run workflow"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRunFor(wf);
                  }}
                >
                  <PlayArrowRounded fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton
                  size="small"
                  aria-label="Delete workflow"
                  onClick={(e) => {
                    e.stopPropagation();
                    requestDelete(wf);
                  }}
                >
                  <DeleteOutlineRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deleteWorkflow],
  );

  const runColumns = useMemo<GridColDef<WorkflowRun>[]>(
    () => [
      {
        field: 'createdAt',
        headerName: 'Started',
        width: 200,
        valueGetter: (_value, row) => new Date(row.createdAt),
        renderCell: (params) => formatTime(params.row.createdAt),
      },
      {
        field: 'workflow',
        headerName: 'Workflow',
        flex: 1,
        minWidth: 200,
        sortable: false,
        valueGetter: (_value, row) =>
          workflowNameById.get(row.workflowId) ?? row.workflowId,
      },
      {
        field: 'currentStepKey',
        headerName: 'Step',
        width: 160,
        sortable: false,
        valueGetter: (_value, row) => row.currentStepKey ?? '—',
      },
      {
        field: 'status',
        headerName: 'Status',
        width: 140,
        renderCell: (params) => <StatusChip status={params.row.status} />,
      },
      {
        field: 'actions',
        headerName: '',
        width: 80,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        align: 'right',
        renderCell: (params) => (
          <Box
            className="row-actions"
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              height: '100%',
            }}
          >
            <Tooltip title="Open run">
              <IconButton
                size="small"
                aria-label="Open run"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/workflows/runs/${params.row.id}`);
                }}
              >
                <OpenInNewRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workflowNameById],
  );

  return (
    <MainContainer>
      <Stack spacing={3}>
        <Header
          title={
            <Tabs
              value={view}
              onChange={(_, v: WorkflowsView) => setView(v)}
            >
              <Tab label="Workflows" value={WorkflowsView.CONFIG} />
              <Tab label="Recent runs" value={WorkflowsView.RUNS} />
            </Tabs>
          }
          actions={
            view === WorkflowsView.CONFIG && (
              <Button
                variant="contained"
                onClick={() => setEditing({ workflow: null })}
              >
                New workflow
              </Button>
            )
          }
        />

        {view === WorkflowsView.CONFIG ? (
          <DataGrid
            rows={workflows}
            columns={workflowColumns}
            autoHeight
            disableVirtualization
            disableRowSelectionOnClick
            onRowClick={(params: GridRowParams<Workflow>) =>
              setEditing({ workflow: params.row })
            }
            pageSizeOptions={[25, 50, 100]}
            sx={ROW_ACTIONS_SX}
          />
        ) : (
          <DataGrid
            rows={runs}
            columns={runColumns}
            autoHeight
            disableVirtualization
            disableRowSelectionOnClick
            onRowClick={(params: GridRowParams<WorkflowRun>) =>
              navigate(`/workflows/runs/${params.row.id}`)
            }
            initialState={{
              sorting: { sortModel: [{ field: 'createdAt', sort: 'desc' }] },
            }}
            pageSizeOptions={[25, 50, 100]}
            sx={ROW_ACTIONS_SX}
          />
        )}

        <WorkflowEditorDialog
          open={editing !== null}
          workflow={editing?.workflow ?? null}
          onClose={() => setEditing(null)}
        />

        <Dialog
          open={Boolean(runFor)}
          onClose={() => setRunFor(null)}
          fullWidth
          maxWidth="sm"
        >
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
            <Button
              variant="contained"
              onClick={triggerRun}
              disabled={runWorkflow.isPending}
            >
              Run
            </Button>
          </DialogActions>
        </Dialog>
      </Stack>
    </MainContainer>
  );
};
