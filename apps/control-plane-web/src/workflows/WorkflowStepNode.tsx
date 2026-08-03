import { Box, Chip, Typography } from '@mui/material';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { FC } from 'react';
import { useNavigate } from 'react-router';
import { WorkflowStepKind } from '@sagewright/shared';

import { RunnerChip } from '../components/RunnerChip';
import { NODE_H, NODE_W, StepNodeStatus, type StepNodeData } from './workflow-graph';

const STATUS_COLOR: Record<StepNodeStatus, 'default' | 'info' | 'success' | 'error'> = {
  [StepNodeStatus.PENDING]: 'default',
  [StepNodeStatus.RUNNING]: 'info',
  [StepNodeStatus.DONE]: 'success',
  [StepNodeStatus.FAILED]: 'error',
};

const BORDER: Record<StepNodeStatus, string> = {
  [StepNodeStatus.PENDING]: 'divider',
  [StepNodeStatus.RUNNING]: 'info.main',
  [StepNodeStatus.DONE]: 'success.main',
  [StepNodeStatus.FAILED]: 'error.main',
};

/** One step in the run graph. Clicking it opens that step's live transcript. */
export const WorkflowStepNode: FC<NodeProps<Node<StepNodeData>>> = ({ data }) => {
  const navigate = useNavigate();
  const clickable = Boolean(data.taskId);

  return (
    <Box
      onClick={() => data.taskId && navigate(`/tasks/${data.taskId}`)}
      sx={{
        width: NODE_W,
        height: NODE_H,
        boxSizing: 'border-box',
        p: 1.25,
        borderRadius: 1,
        border: '2px solid',
        borderColor: BORDER[data.status],
        bgcolor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        cursor: clickable ? 'pointer' : 'default',
        '&:hover': clickable ? { bgcolor: 'action.hover' } : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} />
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="subtitle2" noWrap sx={{ fontWeight: 600 }}>
          {data.name}
        </Typography>
        <Chip label={data.status} color={STATUS_COLOR[data.status]} size="small" />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
        <Chip
          label={data.kind}
          size="small"
          variant="outlined"
          color={data.kind === WorkflowStepKind.VALIDATION ? 'warning' : 'default'}
        />
        <RunnerChip image={data.runnerImage} />
        {data.iteration != null && data.iteration > 0 && (
          <Chip label={`iter ${data.iteration}`} size="small" variant="outlined" />
        )}
      </Box>
      <Handle type="source" position={Position.Right} />
    </Box>
  );
};
