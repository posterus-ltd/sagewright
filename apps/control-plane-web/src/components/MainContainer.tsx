import { Box } from '@mui/material';
import type { FC, ReactNode } from 'react';

import { useUserPreferences } from '../preferences/UserPreferencesProvider';

// Every route shares one content width so the app reads consistently across
// pages; individual pages can still override via `maxWidth`.
const DEFAULT_MAX_WIDTH = 1200;

interface MainContainerProps {
  children: ReactNode;
  // Override the shared content width (defaults to DEFAULT_MAX_WIDTH).
  maxWidth?: number;
  // Fill the available height *and* drop the shared width cap for pages whose
  // content manages its own scroll (e.g. a graph or terminal that should not
  // push the page taller, and benefits from all available width too).
  fill?: boolean;
  // Full-bleed: negate the shell padding so the child reaches the edges (canvas).
  flush?: boolean;
}

// Shared route wrapper that standardises horizontal width, centring and the
// page margins — NOT vertical layout. Each page keeps control of how its own
// content stacks (a Stack, a grid, a graph, whatever fits), so this stays a
// width/margin primitive rather than a one-size-fits-all column.
export const MainContainer: FC<MainContainerProps> = ({
  children,
  maxWidth = DEFAULT_MAX_WIDTH,
  fill,
  flush,
}) => {
  // User-toggleable: full-bleed width drops the shared cap and uses everything.
  const { preference: fullWidthContent } = useUserPreferences('fullWidthContent', false);

  // The canvas is the one exception: it bleeds past the shell padding and owns
  // its whole surface.
  if (flush) {
    // The shell's `p: 3` shrinks our 100% by the top+bottom padding, so add it
    // back — otherwise the negative margin bleeds sideways but the canvas falls
    // short of full height by the vertical padding.
    return <Box sx={{ height: (theme) => `calc(100% + ${theme.spacing(6)})`, m: -3 }}>{children}</Box>;
  }

  return (
    <Box
      sx={{
        width: '100%',
        mx: 'auto',
        maxWidth: fullWidthContent || fill ? 'none' : maxWidth,
        ...(fill && { height: '100%', minHeight: 0 }),
      }}
    >
      {children}
    </Box>
  );
};
