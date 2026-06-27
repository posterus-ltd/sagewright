import { Box } from '@mui/material';
import type { FC } from 'react';
import { Outlet } from 'react-router';

import { CommandPaletteProvider } from './command-palette/CommandPaletteProvider';
import { Sidebar } from './Sidebar';

export const Layout: FC = () => (
  <CommandPaletteProvider>
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default' }}>
      <Sidebar />
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, height: '100vh', overflow: 'auto', p: 3 }}>
        <Outlet />
      </Box>
    </Box>
  </CommandPaletteProvider>
);
