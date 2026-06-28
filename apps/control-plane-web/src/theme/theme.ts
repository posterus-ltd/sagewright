import { createTheme, type Theme } from '@mui/material';
// Registers MuiDataGrid as a themeable component for TS.
import type {} from '@mui/x-data-grid/themeAugmentation';

import { fonts, palettes, radius } from './tokens';

export type ResolvedMode = 'light' | 'dark';

// Builds a MUI theme from our tokens. The overrides push MUI away from its
// stock Material look (drop shadows, big radii, uppercase buttons) toward a
// flat, hairline-bordered, terminal-adjacent surface.
export const buildTheme = (mode: ResolvedMode): Theme => {
  const p = palettes[mode];

  return createTheme({
    palette: {
      mode,
      primary: {
        main: p.accent,
        dark: p.accentHover,
        contrastText: p.onAccent,
      },
      success: { main: p.success },
      error: { main: p.error },
      warning: { main: p.warning },
      info: { main: p.info },
      background: { default: p.bg, paper: p.surface },
      text: { primary: p.text, secondary: p.muted },
      divider: p.border,
    },
    shape: { borderRadius: radius },
    typography: {
      fontFamily: fonts.sans,
      fontSize: 14,
      h5: { fontWeight: 600, letterSpacing: '-0.01em' },
      h6: { fontWeight: 600, letterSpacing: '-0.01em' },
      button: { textTransform: 'none', fontWeight: 500 },
      // Monospace for anything data-shaped: IDs, status, code, timestamps.
      caption: { fontFamily: fonts.mono },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: p.bg },
          // Quiet, terminal-style scrollbars.
          '*::-webkit-scrollbar': { width: 10, height: 10 },
          '*::-webkit-scrollbar-thumb': {
            backgroundColor: p.border,
            borderRadius: 8,
            border: `2px solid ${p.bg}`,
          },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiButton: {
        defaultProps: {
          disableElevation: true,
          variant: 'outlined',
          size: 'small',
        },
        styleOverrides: { root: { boxShadow: 'none' } },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: p.border },
          head: {
            color: p.muted,
            fontWeight: 600,
            fontFamily: fonts.mono,
            fontSize: 12,
            letterSpacing: '0.03em',
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: { '&:hover': { backgroundColor: p.elevated } },
        },
      },
      // DataGrid (MUI X) lightens the divider by 88% for its row borders,
      // which on a white page leaves rows invisible. Point its border
      // variable back at our real hairline so rows read in both modes.
      MuiDataGrid: {
        styleOverrides: {
          root: { '--DataGrid-rowBorderColor': p.border },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontFamily: fonts.mono, fontWeight: 500, fontSize: 12 },
        },
      },
      MuiTextField: { defaultProps: { size: 'small' } },
      MuiOutlinedInput: {
        styleOverrides: { notchedOutline: { borderColor: p.border } },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: p.elevated,
            color: p.text,
            border: `1px solid ${p.border}`,
            fontSize: 12,
          },
        },
      },
    },
  });
};
