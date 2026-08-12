import { Box } from '@mui/material';
import type { FC } from 'react';
import { Outlet } from 'react-router';

import { useAppHeight } from '../theme/layout';
import { CommandPaletteProvider } from './command-palette/CommandPaletteProvider';
import { Sidebar } from './Sidebar';

export const Layout: FC = () => {
  const appH = useAppHeight();
  return (
    <CommandPaletteProvider>
      <Box sx={{ display: 'flex', height: appH, bgcolor: 'background.default' }}>
        <Sidebar />
        <Box component="main" sx={{ flexGrow: 1, minWidth: 0, height: appH, overflow: 'auto', p: 3 }}>
          <Outlet />
        </Box>
      </Box>
    </CommandPaletteProvider>
  );
};
