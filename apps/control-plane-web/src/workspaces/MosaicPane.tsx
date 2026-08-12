import AddRounded from '@mui/icons-material/AddRounded';
import CloseFullscreenRounded from '@mui/icons-material/CloseFullscreenRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import HorizontalSplitRounded from '@mui/icons-material/HorizontalSplitRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import VerticalSplitRounded from '@mui/icons-material/VerticalSplitRounded';
import ZoomOutMapRounded from '@mui/icons-material/ZoomOutMapRounded';
import {
  Box,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from '@mui/material';
import { sessionLabel } from '@sagewright/shared';
import { useMemo, useState, type FC } from 'react';

import { useTask } from '../api/hooks';
import { NewSessionButton } from '../components/NewSessionButton';
import { RunnerChip } from '../components/RunnerChip';
import { SessionTags } from '../components/SessionTags';
import { StatusChip } from '../components/StatusChip';
import { SessionPanel } from '../tasks/SessionPanel';
import { useWorkspaceActions } from './workspace-actions';
import { isEmptyLeaf } from './workspace-mapping';

/** One tiled pane. A session leaf hosts a live `SessionPanel`; an `empty:*` leaf is a
 *  placeholder offering to add an existing session or spawn a new one. Split/zoom/remove come
 *  from `WorkspaceActionsContext` so the pane never carries board callbacks itself. */
export const MosaicPane: FC<{ leafId: string }> = ({ leafId }) =>
  isEmptyLeaf(leafId) ? <EmptyPane leafId={leafId} /> : <SessionPane leafId={leafId} />;

/** Split → / split ↓ / remove — the controls every pane shares. Session panes add zoom and
 *  open-in-new-tab. Reveal-on-hover, mirroring the canvas SessionNode header. */
const PaneControls: FC<{ leafId: string; children?: React.ReactNode }> = ({ leafId, children }) => {
  const { splitLeaf, removeLeaf } = useWorkspaceActions();
  return (
    <Box
      className="mosaic-pane__actions"
      sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}
    >
      {children}
      <Tooltip title="Split right">
        <IconButton size="small" aria-label="Split right" onClick={() => splitLeaf(leafId, 'row')}>
          <VerticalSplitRounded fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Split down">
        <IconButton size="small" aria-label="Split down" onClick={() => splitLeaf(leafId, 'column')}>
          <HorizontalSplitRounded fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Remove pane">
        <IconButton size="small" aria-label="Remove pane" onClick={() => removeLeaf(leafId)}>
          <CloseRounded fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

const paneFrameSx = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  bgcolor: 'background.paper',
  border: '1px solid',
  borderColor: 'divider',
  overflow: 'hidden',
  // Header actions stay out of the way until the pane is hovered or focused.
  '& .mosaic-pane__actions': { opacity: 0, transition: 'opacity 0.12s ease-in-out' },
  '&:hover .mosaic-pane__actions, &:focus-within .mosaic-pane__actions': { opacity: 1 },
} as const;

const SessionPane: FC<{ leafId: string }> = ({ leafId }) => {
  const { data: task } = useTask(leafId);
  const { toggleZoom, focusLeaf, zoomedLeafId } = useWorkspaceActions();
  const zoomed = zoomedLeafId === leafId;
  const title = task ? sessionLabel(task) : 'Interactive session';

  return (
    <Box sx={paneFrameSx} onMouseDownCapture={() => focusLeaf(leafId)} onFocusCapture={() => focusLeaf(leafId)}>
      {/* Header — pane title + live status, then the controls. */}
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
        }}
      >
        <Typography
          variant="body2"
          sx={{ flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {title}
        </Typography>
        {task != null && <StatusChip status={task.status} />}
        {task != null && <SessionTags session={task} />}
        {task?.runnerImage != null && <RunnerChip image={task.runnerImage} />}
        <PaneControls leafId={leafId}>
          <Tooltip title={zoomed ? 'Restore' : 'Zoom'}>
            <IconButton
              size="small"
              aria-label={zoomed ? 'Restore pane' : 'Zoom pane'}
              onClick={() => toggleZoom(leafId)}
            >
              {zoomed ? <CloseFullscreenRounded fontSize="small" /> : <ZoomOutMapRounded fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Open in new tab">
            <IconButton
              size="small"
              aria-label="Open session in new tab"
              component="a"
              href={`/tasks/${leafId}`}
              target="_blank"
              rel="noreferrer"
            >
              <OpenInNewRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        </PaneControls>
      </Box>

      {/* Body — a flex column so the panel (and its terminal) fills the pane's full width. */}
      <Box sx={{ flexGrow: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', p: 1, overflow: 'hidden' }}>
        <SessionPanel taskId={leafId} compact />
      </Box>
    </Box>
  );
};

const EmptyPane: FC<{ leafId: string }> = ({ leafId }) => {
  const { assignSession, availableSessions } = useWorkspaceActions();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? availableSessions.filter((s) => sessionLabel(s).toLowerCase().includes(q)) : availableSessions;
  }, [availableSessions, search]);

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        m: 0.5,
        border: '1px dashed',
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'background.paper',
        overflow: 'hidden',
        '& .mosaic-pane__actions': { opacity: 0.5, transition: 'opacity 0.12s ease-in-out' },
        '&:hover .mosaic-pane__actions, &:focus-within .mosaic-pane__actions': { opacity: 1 },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 0.5, pt: 0.5 }}>
        <PaneControls leafId={leafId} />
      </Box>
      <Box
        sx={{
          flexGrow: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1.5,
          p: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Empty pane
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Tooltip title={availableSessions.length === 0 ? 'No unplaced sessions' : ''}>
            <span>
              <IconButton
                size="small"
                aria-label="Add existing session"
                disabled={availableSessions.length === 0}
                onClick={(e) => setMenuAnchor(e.currentTarget)}
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1, gap: 0.5 }}
              >
                <AddRounded fontSize="small" />
                <Typography variant="body2">Add existing</Typography>
              </IconButton>
            </span>
          </Tooltip>
          <NewSessionButton
            size="small"
            variant="outlined"
            label="Spawn new"
            onCreated={(task) => assignSession(leafId, task.id)}
          />
        </Box>
      </Box>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => {
          setMenuAnchor(null);
          setSearch('');
        }}
        slotProps={{ paper: { sx: { maxHeight: 360, width: 280 } } }}
      >
        {availableSessions.length > 8 && (
          <Box sx={{ px: 1.5, py: 0.5 }}>
            <input
              // A plain input keeps focus manageable inside the MUI Menu without extra deps.
              aria-label="Search sessions"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px' }}
            />
          </Box>
        )}
        {filtered.map((s) => (
          <MenuItem
            key={s.id}
            onClick={() => {
              setMenuAnchor(null);
              setSearch('');
              assignSession(leafId, s.id);
            }}
          >
            {sessionLabel(s, 48)}
          </MenuItem>
        ))}
        {filtered.length === 0 && (
          <MenuItem disabled>No matching sessions</MenuItem>
        )}
      </Menu>
    </Box>
  );
};
