import { Box, Typography } from '@mui/material';
import type { FC, ReactNode } from 'react';

interface HeaderProps {
  // A string renders as the standard page title; a node lets a page supply its
  // own lead element (e.g. tabs) while actions stay aligned on the right.
  title?: ReactNode;
  // Optional secondary line under the title (ignored when `title` is a node).
  subtitle?: ReactNode;
  // Buttons or controls pinned to the right of the header row.
  actions?: ReactNode;
}

// Shared page header: a lead element on the left and right-aligned actions, so
// every route shares the same title placement, action alignment and spacing.
export const Header: FC<HeaderProps> = ({ title, subtitle, actions }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: 40 }}>
    {typeof title === 'string' ? (
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="h5">{title}</Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
    ) : (
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>{title}</Box>
    )}
    {actions && (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {actions}
      </Box>
    )}
  </Box>
);
