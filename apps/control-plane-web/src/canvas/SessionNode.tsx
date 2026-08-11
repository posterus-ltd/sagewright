import CloseRounded from '@mui/icons-material/CloseRounded';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import PaletteRounded from '@mui/icons-material/PaletteRounded';
import {
  Box,
  Button,
  IconButton,
  InputBase,
  Popover,
  TextField,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import { sessionLabel } from '@sagewright/shared';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import { useState, type FC, type KeyboardEvent, type MouseEvent } from 'react';

import { useTask, useUpdateTask } from '../api/hooks';
import { StatusChip } from '../components/StatusChip';
import { RunnerChip } from '../components/RunnerChip';
import { SessionTags } from '../components/SessionTags';
import { SessionPanel } from '../tasks/SessionPanel';
import { effectiveBorderColor, glowColor } from './border-colors';
import { useCanvasActions, type SessionNodeData } from './canvas-actions';

export const SESSION_NODE_MIN_WIDTH = 320;
export const SESSION_NODE_MIN_HEIGHT = 240;

/**
 * A draggable, resizable widget hosting one live session. The header is the
 * drag handle; the body is marked `nodrag nowheel` so typing and scrolling in
 * the terminal don't pan or drag the canvas.
 */
export const SessionNode: FC<NodeProps> = ({ id, data, selected }) => {
  const { sessionId, borderColor } = data as SessionNodeData;
  const { removeSession, setBorderColor, usedBorderColors } =
    useCanvasActions();
  const { data: task } = useTask(sessionId);
  const updateTask = useUpdateTask();
  const theme = useTheme();

  const title = task ? sessionLabel(task) : 'Interactive session';

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);

  const openColorPicker = (e: MouseEvent<HTMLElement>): void =>
    setColorAnchor(e.currentTarget);
  const closeColorPicker = (): void => setColorAnchor(null);
  // Border color is always visible; selection is signalled by a glow halo instead of recoloring it.
  const glow = glowColor(borderColor, theme.palette.primary.main);

  const startEditing = (): void => {
    setDraft(task?.name ?? '');
    setEditing(true);
  };

  const commit = (): void => {
    setEditing(false);
    const next = draft.trim();
    if (next === (task?.name ?? '')) return;
    updateTask.mutate({ id: sessionId, name: next || null });
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') setEditing(false);
  };

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: effectiveBorderColor(borderColor),
        overflow: 'hidden',
        boxShadow: selected
          ? `${theme.shadows[3]}, 0 0 0 3px ${alpha(glow, 0.45)}`
          : theme.shadows[1],
        // Header action buttons stay out of the way until the widget is hovered or focused.
        '& .session-node__actions': {
          opacity: 0,
          transition: 'opacity 0.12s ease-in-out',
        },
        '&:hover .session-node__actions, &:focus-within .session-node__actions':
          { opacity: 1 },
      }}
    >
      <NodeResizer
        minWidth={SESSION_NODE_MIN_WIDTH}
        minHeight={SESSION_NODE_MIN_HEIGHT}
        isVisible={selected}
      />

      {/* Header — the drag handle. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.default',
          cursor: 'grab',
          '&:active': { cursor: 'grabbing' },
        }}
      >
        <DragIndicatorRounded
          fontSize="small"
          sx={{ color: 'text.disabled' }}
        />
        {editing ? (
          <InputBase
            className="nodrag"
            autoFocus
            value={draft}
            placeholder={
              task?.prompt ? task.prompt.slice(0, 60) : 'Session name'
            }
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
            inputProps={{ 'aria-label': 'Session name', maxLength: 200 }}
            sx={{
              flexGrow: 1,
              minWidth: 0,
              fontSize: (t) => t.typography.body2.fontSize,
            }}
          />
        ) : (
          <Tooltip title="Double-click to rename">
            <Typography
              variant="body2"
              onDoubleClick={startEditing}
              sx={{
                flexGrow: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                cursor: 'text',
              }}
            >
              {title}
            </Typography>
          </Tooltip>
        )}
        {/* Reveal-on-hover cluster: session state, runner label, and actions. Kept visible while the color popover
            is open, since it portals outside the widget and would otherwise drop the hover/focus-within state. */}
        <Box
          className="session-node__actions"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            opacity: colorAnchor ? 1 : undefined,
          }}
        >
          {task != null && <StatusChip status={task.status} />}
          {task != null && <SessionTags session={task} />}
          {task?.runnerImage != null && <RunnerChip image={task.runnerImage} />}
          <Tooltip title="Rename">
            <IconButton
              className="nodrag"
              size="small"
              aria-label="Rename session"
              onClick={startEditing}
            >
              <EditRounded fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Border color">
            <IconButton
              className="nodrag"
              size="small"
              aria-label="Border color"
              onClick={openColorPicker}
            >
              <PaletteRounded fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Open in new tab">
            <IconButton
              className="nodrag"
              size="small"
              aria-label="Open session in new tab"
              component="a"
              href={`/tasks/${sessionId}`}
              target="_blank"
              rel="noreferrer"
            >
              <OpenInNewRounded fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Remove from canvas">
            <IconButton
              className="nodrag"
              size="small"
              aria-label="Remove from canvas"
              onClick={() => removeSession(id)}
            >
              <CloseRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Popover
        open={Boolean(colorAnchor)}
        anchorEl={colorAnchor}
        onClose={closeColorPicker}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { className: 'nodrag nowheel' } }}
      >
        <Box
          sx={{
            p: 1.5,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            width: 220,
          }}
        >
          {usedBorderColors.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {usedBorderColors.map((c) => (
                <Tooltip key={c} title={c}>
                  <Box
                    component="button"
                    type="button"
                    aria-label={`Use color ${c}`}
                    aria-pressed={c === borderColor}
                    onClick={() => setBorderColor(sessionId, c)}
                    sx={{
                      width: 24,
                      height: 24,
                      p: 0,
                      borderRadius: '50%',
                      bgcolor: c,
                      cursor: 'pointer',
                      border: '2px solid',
                      borderColor:
                        c === borderColor ? 'text.primary' : 'transparent',
                    }}
                  />
                </Tooltip>
              ))}
            </Box>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              component="input"
              type="color"
              aria-label="Pick border color"
              value={borderColor ?? '#000000'}
              onChange={(e) => setBorderColor(sessionId, e.target.value)}
              sx={{
                width: 36,
                height: 36,
                p: 0,
                border: 'none',
                bgcolor: 'transparent',
                cursor: 'pointer',
              }}
            />
            <TextField
              size="small"
              label="Hex"
              value={borderColor ?? ''}
              placeholder="#3fb950"
              onChange={(e) =>
                setBorderColor(sessionId, e.target.value || undefined)
              }
              slotProps={{
                htmlInput: { 'aria-label': 'Border color hex', maxLength: 9 },
              }}
              sx={{ flexGrow: 1 }}
            />
          </Box>
          <Button
            size="small"
            onClick={() => setBorderColor(sessionId, undefined)}
          >
            Reset to default
          </Button>
        </Box>
      </Popover>

      {/* Body — interactive; must not start a drag or pan the canvas. A flex COLUMN so the
          panel (and the terminal inside it) stretches to the widget's full width, not its
          content width. */}
      <Box
        className="nodrag nowheel"
        sx={{
          flexGrow: 1,
          minHeight: 0,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          p: 1,
          overflow: 'hidden',
        }}
      >
        <SessionPanel taskId={sessionId} compact />
      </Box>
    </Box>
  );
};
