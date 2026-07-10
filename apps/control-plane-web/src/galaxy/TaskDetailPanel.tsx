import { CloseRounded } from '@mui/icons-material';
import { Box, Divider, Drawer, IconButton, Link as MuiLink, Typography } from '@mui/material';
import type { FC } from 'react';
import { Link as RouterLink } from 'react-router';

import { StatusChip } from '../components/StatusChip';
import type { StarNode } from './galaxy-graph-data';

interface TaskDetailPanelProps {
  node: StarNode | null;
  onClose: () => void;
}

// A slide-over rather than a route change — clicking a star surfaces its details
// without pulling the user out of the 3D scene. The panel links into the full
// task view (terminal/event stream) for anyone who wants to leave the galaxy.
export const TaskDetailPanel: FC<TaskDetailPanelProps> = ({ node, onClose }) => (
  <Drawer anchor="right" open={node !== null} onClose={onClose}>
    {node && (
      <Box sx={{ width: 320, p: 3, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, pr: 1 }}>
            {node.name}
          </Typography>
          <IconButton size="small" onClick={onClose}>
            <CloseRounded fontSize="small" />
          </IconButton>
        </Box>
        <Box>
          <StatusChip status={node.status} />
        </Box>
        <Divider />
        <Typography variant="body2" color="text.secondary">
          Agent: {node.workerImage ?? 'unassigned'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Kind: {node.kind}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Created: {new Date(node.createdAt).toLocaleString()}
        </Typography>
        {node.endedAt && (
          <Typography variant="body2" color="text.secondary">
            Ended: {new Date(node.endedAt).toLocaleString()}
          </Typography>
        )}
        <MuiLink component={RouterLink} to={`/tasks/${node.id}`} sx={{ mt: 1 }}>
          Open full task view →
        </MuiLink>
      </Box>
    )}
  </Drawer>
);
