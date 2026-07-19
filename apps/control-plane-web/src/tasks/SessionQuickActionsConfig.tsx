import {
  Checkbox,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Popover,
  Typography,
} from '@mui/material';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import type { FC } from 'react';

import {
  SESSION_QUICK_ACTION_CATALOG,
  SessionQuickAction,
} from './session-quick-actions';

const ALL_ACTIONS = Object.values(SessionQuickAction);

/**
 * Popover for customizing the quick actions bar: check an action to show it,
 * move it up/down to reorder. Enabled actions are listed first in display
 * order, followed by the hidden ones in catalog order.
 */
export const SessionQuickActionsConfig: FC<{
  anchorEl: HTMLElement | null;
  onClose: () => void;
  enabledActions: SessionQuickAction[];
  onChange: (next: SessionQuickAction[]) => void;
  // Portal target for the popover — must resolve to an element inside the
  // session panel, or native fullscreen would render the popover invisible.
  container?: () => HTMLElement | null;
}> = ({ anchorEl, onClose, enabledActions, onChange, container }) => {
  const rows = [
    ...enabledActions,
    ...ALL_ACTIONS.filter((action) => !enabledActions.includes(action)),
  ];

  const toggleAction = (action: SessionQuickAction): void => {
    onChange(
      enabledActions.includes(action)
        ? enabledActions.filter((a) => a !== action)
        : [...enabledActions, action],
    );
  };

  const moveAction = (action: SessionQuickAction, delta: -1 | 1): void => {
    const from = enabledActions.indexOf(action);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= enabledActions.length) return;
    const next = [...enabledActions];
    const displaced = next[to];
    if (displaced === undefined) return;
    next[from] = displaced;
    next[to] = action;
    onChange(next);
  };

  return (
    <Popover
      open={anchorEl != null}
      anchorEl={anchorEl}
      onClose={onClose}
      container={container}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
    >
      <Typography variant="subtitle2" sx={{ px: 2, pt: 1.5 }}>
        Quick actions
      </Typography>
      <List dense sx={{ minWidth: 260 }}>
        {rows.map((action) => {
          const { label, Icon } = SESSION_QUICK_ACTION_CATALOG[action];
          const isEnabled = enabledActions.includes(action);
          return (
            <ListItem
              key={action}
              secondaryAction={
                isEnabled && (
                  <>
                    <IconButton
                      size="small"
                      aria-label={`Move ${label} up`}
                      disabled={enabledActions.indexOf(action) === 0}
                      onClick={() => moveAction(action, -1)}
                    >
                      <ArrowUpwardRounded fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      aria-label={`Move ${label} down`}
                      disabled={enabledActions.indexOf(action) === enabledActions.length - 1}
                      onClick={() => moveAction(action, 1)}
                    >
                      <ArrowDownwardRounded fontSize="small" />
                    </IconButton>
                  </>
                )
              }
            >
              <Checkbox
                edge="start"
                size="small"
                checked={isEnabled}
                onChange={() => toggleAction(action)}
                slotProps={{ input: { 'aria-label': `Show ${label}` } }}
              />
              <ListItemIcon sx={{ minWidth: 32 }}>
                <Icon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={label} sx={{ pr: 6 }} />
            </ListItem>
          );
        })}
      </List>
    </Popover>
  );
};
