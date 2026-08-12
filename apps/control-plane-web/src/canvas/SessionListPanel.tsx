import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ViewListRounded from '@mui/icons-material/ViewListRounded';
import {
  Box,
  Collapse,
  IconButton,
  List,
  ListItemButton,
  Paper,
  Typography,
} from '@mui/material';
import { sessionLabel, type Session } from '@sagewright/shared';
import type { Node } from '@xyflow/react';
import { useMemo, useState, type FC } from 'react';

import { effectiveBorderColor } from './border-colors';
import type { SessionNodeData } from './canvas-actions';
import { StatusChip } from '../components/StatusChip';

interface SessionListPanelProps {
  nodes: Node<SessionNodeData>[]; // placed widgets, in render order
  tasks: Session[]; // source of name + status
  onSelect: (sessionId: string) => void;
}

/**
 * A docked, collapsible index of every session currently placed on the canvas.
 * Each row shows the widget's border color, its name, and its status chip;
 * clicking a row asks the board to fly the viewport to that widget.
 */
export const SessionListPanel: FC<SessionListPanelProps> = ({
  nodes,
  tasks,
  onSelect,
}) => {
  const [open, setOpen] = useState(true);

  // Resolve each node's session (name + status) by id.
  const tasksById = useMemo(
    () => new Map(tasks.map((t) => [t.id, t])),
    [tasks],
  );

  // Empty board → nothing to index; the top-center hint already covers that state.
  if (nodes.length === 0) return null;

  return (
    <Paper
      elevation={3}
      sx={{ width: 240, maxWidth: '32vw', overflow: 'hidden' }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          bgcolor: 'background.default',
        }}
      >
        <ViewListRounded fontSize="small" sx={{ color: 'text.secondary' }} />
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
          Sessions ({nodes.length})
        </Typography>
        <IconButton
          size="small"
          aria-expanded={open}
          aria-label={open ? 'Collapse session list' : 'Expand session list'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <ExpandLessRounded fontSize="small" />
          ) : (
            <ExpandMoreRounded fontSize="small" />
          )}
        </IconButton>
      </Box>

      <Collapse in={open}>
        <List
          dense
          disablePadding
          className="nowheel"
          sx={{ maxHeight: 360, overflowY: 'auto' }}
        >
          {nodes.map((n) => {
            const task = tasksById.get(n.id);
            return (
              <ListItemButton
                key={n.id}
                onClick={() => onSelect(n.id)}
                sx={{ gap: 1 }}
              >
                <Box
                  sx={{
                    flexShrink: 0,
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    bgcolor: effectiveBorderColor(n.data.borderColor),
                  }}
                />
                <Typography
                  variant="body2"
                  sx={{
                    flexGrow: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {task ? sessionLabel(task) : n.id}
                </Typography>
                {task != null && <StatusChip status={task.status} />}
              </ListItemButton>
            );
          })}
        </List>
      </Collapse>
    </Paper>
  );
};
