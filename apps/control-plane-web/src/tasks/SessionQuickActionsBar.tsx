import { Box, IconButton, Stack, Tooltip } from '@mui/material';
import TuneRounded from '@mui/icons-material/TuneRounded';
import { useState, type FC } from 'react';

import { useUserPreferences } from '../preferences/UserPreferencesProvider';
import { SessionQuickActionsConfig } from './SessionQuickActionsConfig';
import {
  DEFAULT_SESSION_QUICK_ACTIONS,
  SESSION_QUICK_ACTION_CATALOG,
  SessionQuickActionKind,
  sanitizeSessionQuickActions,
} from './session-quick-actions';
import { useVoiceDictation } from './useVoiceDictation';

/**
 * Icon-only quick actions bar for a session: a bottom row on the detail route,
 * squeezed next to the view switcher in widget headers (`dense`). Each action
 * types into the agent PTY (prompts, accept/reject keys) or toggles voice
 * dictation; which actions appear and in what order is a user preference,
 * editable in place via the trailing customize button. Rendered inside the
 * session panel so it stays available in fullscreen.
 */
export const SessionQuickActionsBar: FC<{
  // False while no agent PTY can take input (log/transcript view, dead session).
  isTerminalInputAvailable: boolean;
  onTerminalInput: (data: string) => void;
  // Tighter buttons for the widget header; full 44px touch targets otherwise.
  dense?: boolean;
  // Portal target for the customize popover; see SessionQuickActionsConfig.
  popoverContainer?: () => HTMLElement | null;
}> = ({ isTerminalInputAvailable, onTerminalInput, dense = false, popoverContainer }) => {
  const { preference, updatePreference } = useUserPreferences(
    'sessionQuickActions',
    DEFAULT_SESSION_QUICK_ACTIONS,
  );
  const enabledActions = sanitizeSessionQuickActions(preference);
  const [configAnchor, setConfigAnchor] = useState<HTMLElement | null>(null);
  const { isSupported, isListening, toggleListening } = useVoiceDictation(onTerminalInput);

  const buttonSize = dense ? 32 : 44;

  return (
    <Stack
      direction="row"
      role="toolbar"
      aria-label="Quick actions"
      sx={{ alignItems: 'center', gap: 0.5, overflowX: 'auto', flexShrink: 0, minWidth: 0 }}
    >
      {enabledActions.map((action) => {
        const { label, Icon, kind } = SESSION_QUICK_ACTION_CATALOG[action];
        const isDictation = kind === SessionQuickActionKind.DICTATION;
        const isDisabled = !isTerminalInputAvailable || (isDictation && !isSupported);
        const title = isDictation && !isSupported ? `${label} (not supported in this browser)` : label;
        return (
          <Tooltip key={action} title={title}>
            {/* span keeps the tooltip working while the button is disabled */}
            <span>
              <IconButton
                size={dense ? 'small' : 'medium'}
                color={isDictation && isListening ? 'error' : 'secondary'}
                aria-label={label}
                aria-pressed={isDictation ? isListening : undefined}
                disabled={isDisabled}
                sx={{ minWidth: buttonSize, minHeight: buttonSize }}
                // Keep focus (and the mobile keyboard) on the terminal.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (isDictation) {
                    toggleListening();
                    return;
                  }
                  const { input } = SESSION_QUICK_ACTION_CATALOG[action];
                  if (input) onTerminalInput(input);
                }}
              >
                <Icon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        );
      })}
      <Box sx={{ flex: 1 }} />
      <Tooltip title="Customize quick actions">
        <IconButton
          size={dense ? 'small' : 'medium'}
          color="secondary"
          aria-label="Customize quick actions"
          sx={{ minWidth: buttonSize, minHeight: buttonSize }}
          onClick={(e) => setConfigAnchor(e.currentTarget)}
        >
          <TuneRounded fontSize="small" />
        </IconButton>
      </Tooltip>
      <SessionQuickActionsConfig
        anchorEl={configAnchor}
        onClose={() => setConfigAnchor(null)}
        enabledActions={enabledActions}
        onChange={updatePreference}
        container={popoverContainer}
      />
    </Stack>
  );
};
