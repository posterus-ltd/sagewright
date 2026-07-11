import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  CircularProgress,
  Link as MuiLink,
  Typography,
  useTheme,
} from '@mui/material';
import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { SessionStatus } from '@sagewright/shared';
import { useMemo, type FC } from 'react';
import { Link, useParams } from 'react-router';

import { useWorkflowRun } from '../api/hooks';
import { MainContainer } from '../components/MainContainer';
import { StatusChip } from '../components/StatusChip';
import { WorkflowStepNode } from './WorkflowStepNode';
import { buildWorkflowGraph } from './workflow-graph';

const nodeTypes: NodeTypes = { workflowStep: WorkflowStepNode };

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

  // Full-bleed like the canvas route: the graph owns the whole main area, with
  // run metadata and errors floating as overlay panels.
  return (
    <MainContainer flush>
      <Box sx={{ width: '100%', height: '100%' }}>
        <ReactFlowProvider>
          <ReactFlow
            nodeTypes={nodeTypes}
            nodes={graph.nodes}
            edges={graph.edges}
            colorMode={theme.palette.mode}
            fitView
            nodesDraggable={false}
            snapToGrid
            snapGrid={[20, 20]}
            proOptions={{ hideAttribution: true }}
          >
            <Background color={theme.palette.divider} gap={20} />
            <Controls showInteractive={false} />

            <Panel position="top-left">
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  flexWrap: 'wrap',
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  px: 1.5,
                  py: 1,
                  boxShadow: 1,
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
                <Typography variant="subtitle1">
                  {run.definition.name}
                </Typography>
                <StatusChip status={run.status} />
                {run.iteration > 0 && (
                  <Chip
                    label={`iteration ${run.iteration}`}
                    size="small"
                    variant="outlined"
                  />
                )}
                {run.prUrl && (
                  <MuiLink href={run.prUrl} target="_blank" rel="noreferrer">
                    View PR
                  </MuiLink>
                )}
              </Box>
            </Panel>

            {run.error && (
              <Panel position="bottom-center" style={{ maxWidth: '80%' }}>
                <Alert severity={run.status === SessionStatus.FAILED ? 'error' : 'warning'}>
                  <AlertTitle>
                    {run.status === SessionStatus.FAILED
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
                      Click the highlighted step in the graph to open its
                      transcript.
                    </Typography>
                  )}
                </Alert>
              </Panel>
            )}
          </ReactFlow>
        </ReactFlowProvider>
      </Box>
    </MainContainer>
  );
};
