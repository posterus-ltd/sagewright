import { Chip, Stack, type ChipProps } from '@mui/material';
import { SessionKind, SessionOrigin, type Session } from '@sagewright/shared';
import { type FC } from 'react';

/**
 * Small attribution tags for a session: "delegated" when an agent spawned it on the user's
 * behalf over MCP, and "shell" for a no-agent CLI widget. Renders nothing when neither
 * applies, so it can be dropped next to a status chip without reserving space.
 */
export const SessionTags: FC<{ session: Pick<Session, 'origin' | 'kind'>; size?: ChipProps['size'] }> = ({
  session,
  size = 'small',
}) => {
  const delegated = session.origin === SessionOrigin.AGENT;
  const shell = session.kind === SessionKind.SHELL;
  if (!delegated && !shell) return null;
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
      {shell && <Chip label="shell" size={size} variant="outlined" color="info" />}
      {delegated && <Chip label="delegated" size={size} variant="outlined" color="secondary" />}
    </Stack>
  );
};
