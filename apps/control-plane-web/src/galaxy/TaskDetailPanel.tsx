import {
  ArrowOutwardRounded,
  CloseRounded,
  PersonOutlineRounded,
  RouteRounded,
} from '@mui/icons-material';
import {
  Box,
  Divider,
  Drawer,
  IconButton,
  Link as MuiLink,
  Typography,
} from '@mui/material';
import { DateTime } from 'luxon';
import type { FC } from 'react';
import { Link as RouterLink } from 'react-router';

import { StatusChip } from '../components/StatusChip';
import { RunnerChip } from '../components/RunnerChip';
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
export const TaskDetailPanel: FC<TaskDetailPanelProps> = ({
  node,
  onClose,
}) => {
  const created = node ? DateTime.fromISO(node.createdAt) : null;
  const ended = node?.endedAt ? DateTime.fromISO(node.endedAt) : null;

  return (
    // Persistent (non-modal): no backdrop dimming the field, and stars stay
    // clickable while it's open so the panel follows the selection.
    <Drawer
      anchor="right"
      variant="persistent"
      open={node !== null}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: { xs: 'min(100vw, 380px)', md: 380 },
            bgcolor: 'background.paper',
            backgroundImage: 'none',
            borderLeftColor: 'divider',
          },
        },
      }}
    >
      {node && created && (
        <Box
          sx={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}
        >
          <Box
            sx={{
              height: 3,
              background: 'linear-gradient(90deg, primary.main, info.main)',
            }}
          />
          <Box
            sx={{
              p: { xs: 2.5, md: 3 },
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 1,
              }}
            >
              <Box>
                <Typography
                  variant="overline"
                  color="text.secondary"
                  sx={{ letterSpacing: '0.12em' }}
                >
                  Task signal
                </Typography>
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 700, lineHeight: 1.25, mt: 0.25 }}
                >
                  {node.name}
                </Typography>
              </Box>
              <IconButton
                size="small"
                onClick={onClose}
                aria-label="Close task details"
              >
                <CloseRounded fontSize="small" />
              </IconButton>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <StatusChip status={node.status} />
              <RunnerChip image={node.runnerImage} />
            </Box>
            {node.prompt && (
              <Box
                sx={{
                  p: 2,
                  bgcolor: 'action.hover',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: 'block',
                    mb: 0.75,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  Mission brief
                </Typography>
                <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                  {node.prompt}
                </Typography>
              </Box>
            )}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: '32px 1fr',
                gap: 1.25,
                alignItems: 'center',
              }}
            >
              <PersonOutlineRounded color="action" />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Owned by
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {node.createdBy}
                </Typography>
              </Box>
              <RouteRounded color="action" />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Working on
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {(
                    node.currentStepKey ??
                    node.workflowStepKey ??
                    'Building & validating'
                  ).replace(/[-_]/g, ' ')}
                  {node.iteration !== null
                    ? ` · iteration ${node.iteration}`
                    : ''}
                </Typography>
              </Box>
            </Box>
            <Divider />
            <Row label="Kind" value={node.kind} />
            <Row
              label="Created"
              value={
                created.toRelative() ??
                created.toLocaleString(DateTime.DATETIME_MED)
              }
            />
            {ended && (
              <Row
                label="Ended"
                value={
                  ended.toRelative() ??
                  ended.toLocaleString(DateTime.DATETIME_MED)
                }
              />
            )}
            {ended && (
              <Row
                label="Duration"
                value={formatDuration(ended.toMillis() - created.toMillis())}
              />
            )}
            {node.branch && <Row label="Branch" value={node.branch} />}
            <MuiLink
              component={RouterLink}
              to={`/tasks/${node.id}`}
              sx={{
                mt: 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                fontWeight: 650,
              }}
            >
              Open live task <ArrowOutwardRounded sx={{ fontSize: 16 }} />
            </MuiLink>
            {node.prUrl && (
              <MuiLink
                href={node.prUrl}
                target="_blank"
                rel="noreferrer"
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
              >
                View pull request <ArrowOutwardRounded sx={{ fontSize: 16 }} />
              </MuiLink>
            )}
          </Box>
        </Box>
      )}
    </Drawer>
  );
};
