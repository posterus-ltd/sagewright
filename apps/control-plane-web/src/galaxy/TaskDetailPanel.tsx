import { CloseRounded } from '@mui/icons-material';
import { Box, Divider, Drawer, IconButton, Link as MuiLink, Typography } from '@mui/material';
import { DateTime } from 'luxon';
import type { FC } from 'react';
import { Link as RouterLink } from 'react-router';

import { StatusChip } from '../components/StatusChip';
import { WorkerChip } from '../components/WorkerChip';
import type { StarNode } from './galaxy-graph-data';

interface TaskDetailPanelProps {
  node: StarNode | null;
  onClose: () => void;
}

const formatDuration = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m ${totalSeconds % 60}s`;
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
};

const Row: FC<{ label: string; value: string }> = ({ label, value }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="body2" sx={{ textAlign: 'right' }}>
      {value}
    </Typography>
  </Box>
);

// A slide-over rather than a route change — clicking a star surfaces its details
// without pulling the user out of the 3D scene. The panel links into the full
// task view (terminal/event stream) for anyone who wants to leave the galaxy.
export const TaskDetailPanel: FC<TaskDetailPanelProps> = ({ node, onClose }) => {
  const created = node ? DateTime.fromISO(node.createdAt) : null;
  const ended = node?.endedAt ? DateTime.fromISO(node.endedAt) : null;

  return (
    // Persistent (non-modal): no backdrop dimming the field, and stars stay
    // clickable while it's open so the panel follows the selection.
    <Drawer anchor="right" variant="persistent" open={node !== null} onClose={onClose}>
      {node && created && (
        <Box sx={{ width: 320, p: 3, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, pr: 1 }}>
              {node.name}
            </Typography>
            <IconButton size="small" onClick={onClose}>
              <CloseRounded fontSize="small" />
            </IconButton>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <StatusChip status={node.status} />
            <WorkerChip image={node.workerImage} />
          </Box>
          <Divider />
          <Row label="Kind" value={node.kind} />
          <Row label="Created" value={created.toRelative() ?? created.toLocaleString(DateTime.DATETIME_MED)} />
          {ended && <Row label="Ended" value={ended.toRelative() ?? ended.toLocaleString(DateTime.DATETIME_MED)} />}
          {ended && <Row label="Duration" value={formatDuration(ended.toMillis() - created.toMillis())} />}
          <MuiLink component={RouterLink} to={`/tasks/${node.id}`} sx={{ mt: 1 }}>
            Open full task view →
          </MuiLink>
        </Box>
      )}
    </Drawer>
  );
};
