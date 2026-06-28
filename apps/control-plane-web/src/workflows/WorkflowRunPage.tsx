import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  CircularProgress,
  Link as MuiLink,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMemo, type FC } from 'react';
import { Link, useParams } from 'react-router';

import { useWorkflowRun } from '../api/hooks';
import { Header } from '../components/Header';
import { MainContainer } from '../components/MainContainer';
import { WorkflowStepNode } from './WorkflowStepNode';
import { buildWorkflowGraph } from './workflow-graph';

const nodeTypes: NodeTypes = { workflowStep: WorkflowStepNode };

const RUN_STATUS_COLOR = {
  queued: 'info',
  running: 'info',
  succeeded: 'success',
  failed: 'error',
  max_iterations: 'warning',
} as const;

export const WorkflowRunPage: FC = () => {
  const { id = '' } = useParams();
  const theme = useTheme();
  const { data: run, isLoading } = useWorkflowRun(id);

  const graph = useMemo(
    () => (run ? buildWorkflowGraph(run.definition, run.steps) : null),
    [run],
  );

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!run || !graph) {
    return <Typography sx={{ p: 2 }}>Run not found.</Typography>;
  }

  return (
    <MainContainer fill>
      <Stack spacing={2} sx={{ height: '100%', minHeight: 0 }}>
        <Header
          title={
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                flexWrap: 'wrap',
              }}
            >
              <Button
                component={Link}
                to="/workflows"
                size="small"
                variant="text"
              >
                ← Workflows
              </Button>
              <Typography variant="h6">{run.definition.name}</Typography>
              <Chip
                label={run.status}
                color={RUN_STATUS_COLOR[run.status]}
                size="small"
              />
              {run.iteration > 0 && (
                <Chip
                  label={`iteration ${run.iteration}`}
                  size="small"
                  variant="outlined"
                />
              )}
            </Box>
          }
          actions={
            run.prUrl && (
              <MuiLink href={run.prUrl} target="_blank" rel="noreferrer">
                View PR
              </MuiLink>
            )
          }
        />

        {run.error && (
          <Alert severity={run.status === 'failed' ? 'error' : 'warning'}>
            <AlertTitle>
              {run.status === 'failed'
                ? 'Run failed'
                : 'Stopped at max iterations'}
              {run.currentStepKey && ` — step "${run.currentStepKey}"`}
            </AlertTitle>
            <Box
              component="pre"
              sx={{ m: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}
            >
              {run.error}
            </Box>
            {run.currentStepKey && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                Click the highlighted step in the graph to open its transcript.
              </Typography>
            )}
          </Alert>
        )}

        <Box
          sx={{
            flexGrow: 1,
            minHeight: 320,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
          }}
        >
          <ReactFlowProvider>
            <ReactFlow
              nodeTypes={nodeTypes}
              nodes={graph.nodes}
              edges={graph.edges}
              colorMode={theme.palette.mode}
              fitView
              nodesDraggable={false}
              proOptions={{ hideAttribution: true }}
            >
              <Background color={theme.palette.divider} gap={20} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
        </Box>
      </Stack>
    </MainContainer>
  );
};
