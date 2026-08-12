import AddRounded from '@mui/icons-material/AddRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import ViewQuiltRounded from '@mui/icons-material/ViewQuiltRounded';
import {
  Box,
  Divider,
  IconButton,
  InputBase,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from '@mui/material';
import { sessionLeafIds, type Workspace } from '@sagewright/shared';
import { useState, type FC, type KeyboardEvent } from 'react';

import { ButtonType, useConfirmation } from '../components/ConfirmDialogProvider';
import { leafIds } from './workspace-mapping';

interface WorkspacesListProps {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

/** The right rail: one row per workspace (name, pane/session count, active highlight), plus
 *  create / rename / duplicate / delete. This is the only chooser — there is no separate
 *  session sidebar. Collapses to a thin strip. */
export const WorkspacesList: FC<WorkspacesListProps> = ({
  workspaces,
  activeWorkspaceId,
  collapsed,
  onToggleCollapsed,
  onSwitch,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
}) => {
  const { confirm } = useConfirmation();
  const [menuFor, setMenuFor] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const startRename = (ws: Workspace): void => {
    setMenuFor(null);
    setRenamingId(ws.id);
    setDraft(ws.name);
  };
  const commitRename = (id: string): void => {
    setRenamingId(null);
    const next = draft.trim();
    if (next) onRename(id, next.slice(0, 120));
  };
  const onRenameKey = (e: KeyboardEvent, id: string): void => {
    if (e.key === 'Enter') commitRename(id);
    else if (e.key === 'Escape') setRenamingId(null);
  };

  const confirmDelete = (ws: Workspace): void => {
    setMenuFor(null);
    confirm({
      title: `Delete "${ws.name}"?`,
      content: 'This removes the workspace and its layout. The sessions themselves are untouched.',
      buttons: [
        { label: 'Cancel' },
        { label: 'Delete', type: ButtonType.DANGER, onClick: () => onDelete(ws.id) },
      ],
    });
  };

  if (collapsed) {
    return (
      <Box
        sx={{
          width: 44,
          flexShrink: 0,
          borderLeft: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          py: 1,
          gap: 1,
        }}
      >
        <Tooltip title="Expand workspaces" placement="left">
          <IconButton size="small" aria-label="Expand workspaces" onClick={onToggleCollapsed}>
            <ChevronLeftRounded fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="New workspace" placement="left">
          <IconButton size="small" aria-label="New workspace" onClick={onCreate}>
            <AddRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: 260,
        flexShrink: 0,
        borderLeft: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1 }}>
        <ViewQuiltRounded fontSize="small" sx={{ color: 'text.secondary' }} />
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
          Workspaces
        </Typography>
        <Tooltip title="New workspace">
          <IconButton size="small" aria-label="New workspace" onClick={onCreate}>
            <AddRounded fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Collapse">
          <IconButton size="small" aria-label="Collapse workspaces" onClick={onToggleCollapsed}>
            <ChevronRightRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <Divider />

      <Box sx={{ overflowY: 'auto', minHeight: 0, flexGrow: 1, py: 0.5 }}>
        {workspaces.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, py: 1 }}>
            No workspaces yet. Create one to start tiling sessions.
          </Typography>
        )}
        {workspaces.map((ws) => {
          const active = ws.id === activeWorkspaceId;
          const panes = leafIds(ws.tree).length;
          const sessions = sessionLeafIds(ws.tree).length;
          return (
            <Box
              key={ws.id}
              onClick={() => onSwitch(ws.id)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1.5,
                py: 0.75,
                cursor: 'pointer',
                borderLeft: '2px solid',
                borderColor: active ? 'primary.main' : 'transparent',
                bgcolor: active ? 'action.selected' : 'transparent',
                '&:hover': { bgcolor: active ? 'action.selected' : 'action.hover' },
                '& .ws-row__more': { opacity: 0 },
                '&:hover .ws-row__more': { opacity: 1 },
              }}
            >
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                {renamingId === ws.id ? (
                  <InputBase
                    autoFocus
                    value={draft}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commitRename(ws.id)}
                    onKeyDown={(e) => onRenameKey(e, ws.id)}
                    inputProps={{ 'aria-label': 'Workspace name', maxLength: 120 }}
                    sx={{ fontSize: (t) => t.typography.body2.fontSize, width: '100%' }}
                  />
                ) : (
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: active ? 600 : 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {ws.name}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  {panes} {panes === 1 ? 'pane' : 'panes'} · {sessions} {sessions === 1 ? 'session' : 'sessions'}
                </Typography>
              </Box>
              <IconButton
                className="ws-row__more"
                size="small"
                aria-label={`Workspace actions for ${ws.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuFor({ id: ws.id, anchor: e.currentTarget });
                }}
              >
                <MoreVertRounded fontSize="small" />
              </IconButton>
            </Box>
          );
        })}
      </Box>

      <Menu anchorEl={menuFor?.anchor ?? null} open={Boolean(menuFor)} onClose={() => setMenuFor(null)}>
        <MenuItem
          onClick={() => {
            const ws = workspaces.find((w) => w.id === menuFor?.id);
            if (ws) startRename(ws);
          }}
        >
          <ListItemIcon>
            <EditRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText>Rename</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuFor) onDuplicate(menuFor.id);
            setMenuFor(null);
          }}
        >
          <ListItemIcon>
            <ContentCopyRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText>Duplicate</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            const ws = workspaces.find((w) => w.id === menuFor?.id);
            if (ws) confirmDelete(ws);
          }}
        >
          <ListItemIcon>
            <DeleteOutlineRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
};
