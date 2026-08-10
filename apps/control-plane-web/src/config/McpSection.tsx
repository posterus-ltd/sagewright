import { Box, FormControlLabel, Switch, TextField, Typography } from '@mui/material';
import { MAX_ACTIVE_SESSIONS_LIMIT } from '@sagewright/shared';
import { useEffect, useState, type FC } from 'react';

import { useUpdateUserSettings, useUserSettings } from '../api/hooks';

export const McpSection: FC = () => {
  const { data } = useUserSettings();
  const enabled = data?.mcpEnabled ?? false;
  const updateSettings = useUpdateUserSettings();

  // Local draft for the numeric cap so typing doesn't fire a save per keystroke; committed
  // on blur/Enter, clamped to the allowed range. Re-seeded whenever the stored value loads
  // or changes elsewhere.
  const [maxDraft, setMaxDraft] = useState('');
  useEffect(() => {
    if (data) setMaxDraft(String(data.maxActiveSessions));
  }, [data]);

  const commitMax = (): void => {
    if (!data) return;
    const parsed = Math.round(Number(maxDraft));
    if (!Number.isFinite(parsed)) {
      setMaxDraft(String(data.maxActiveSessions));
      return;
    }
    const clamped = Math.min(MAX_ACTIVE_SESSIONS_LIMIT, Math.max(1, parsed));
    setMaxDraft(String(clamped));
    if (clamped !== data.maxActiveSessions) {
      void updateSettings.mutateAsync({ maxActiveSessions: clamped });
    }
  };

  return (
    <>
      <Typography variant="h6" gutterBottom>MCP access</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        When enabled, your agents can call the control plane's MCP tools to spawn sessions, schedule
        jobs, create workflows, and arrange your canvas on your behalf. Turn this off to block all MCP
        access for your account — it takes effect on the next call.
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 3 }}>
        <FormControlLabel
          control={
            <Switch
              checked={enabled}
              onChange={(e) => { void updateSettings.mutateAsync({ mcpEnabled: e.target.checked }); }}
              // Disabled until the current value has loaded, so the toggle never renders
              // a misleading "off" that a stray click would then persist.
              disabled={data === undefined || updateSettings.isPending}
            />
          }
          label={enabled ? 'MCP enabled' : 'MCP disabled'}
        />
        <TextField
          type="number"
          size="small"
          label="Max active sessions"
          value={maxDraft}
          onChange={(e) => setMaxDraft(e.target.value)}
          onBlur={commitMax}
          onKeyDown={(e) => { if (e.key === 'Enter') commitMax(); }}
          disabled={data === undefined || !enabled}
          helperText={`Cap on concurrent sessions your agents may spawn (1–${MAX_ACTIVE_SESSIONS_LIMIT}).`}
          slotProps={{ htmlInput: { min: 1, max: MAX_ACTIVE_SESSIONS_LIMIT, 'aria-label': 'Max active sessions' } }}
          sx={{ width: 220 }}
        />
      </Box>
    </>
  );
};
