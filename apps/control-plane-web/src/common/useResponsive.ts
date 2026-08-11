import { useMediaQuery, useTheme } from '@mui/material';

export const useResponsive = (): {
  dense: boolean;
} => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'md'));

  return { dense: isMobile || isTablet };
};
