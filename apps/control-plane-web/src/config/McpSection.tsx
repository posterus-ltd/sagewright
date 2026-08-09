import { FormControlLabel, Switch, Typography } from '@mui/material';
import { type FC } from 'react';

import { useUpdateUserSettings, useUserSettings } from '../api/hooks';

export const McpSection: FC = () => {
  const { data } = useUserSettings();
  const enabled = data?.mcpEnabled ?? false;
  const updateSettings = useUpdateUserSettings();

  return (
    <>
      <Typography variant="h6" gutterBottom>MCP access</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        When enabled, your agents can call the control plane's MCP tools to spawn sessions, schedule
        jobs, and create workflows on your behalf. Turn this off to block all MCP access for your
        account — it takes effect on the next call.
      </Typography>
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
    </>
  );
};
