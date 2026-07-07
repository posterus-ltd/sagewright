import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ReportProblemRoundedIcon from '@mui/icons-material/ReportProblemRounded';
import {
  Box,
  Button,
  Collapse,
  Link,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { type FC, useState } from 'react';

import { fonts } from '../theme/tokens';

interface ErrorFallbackProps {
  /** The caught error to surface to the operator. */
  readonly error: Error;
  /** React's component stack, when available, shown alongside the error. */
  readonly componentStack?: string | null;
}

/**
 * The friendly fault page shown when a render crash is caught. It replaces the
 * blank screen with recovery actions and an expandable panel of raw error and
 * stack details.
 *
 * Its actions use a full reload rather than react-router navigation: once the
 * tree has thrown, the safest recovery is a clean boot rather than trusting the
 * broken in-memory state.
 *
 * This is the shared presentation used by both the top-level
 * {@link ErrorBoundary} (which catches errors outside the router) and the
 * route-level error element (which catches errors thrown inside a route).
 */
export const ErrorFallback: FC<ErrorFallbackProps> = ({
  error,
  componentStack,
}) => {
  const [expanded, setExpanded] = useState(false);

  const handleReload = (): void => {
    window.location.reload();
  };

  const handleHome = (): void => {
    window.location.assign('/');
  };

  const toggleDetails = (): void => {
    setExpanded((prev) => !prev);
  };

  const details = [error.stack ?? `${error.name}: ${error.message}`]
    .concat(componentStack ? [`\nComponent stack:${componentStack}`] : [])
    .join('\n');

  return (
    <Box
      role="alert"
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 3,
        bgcolor: 'background.default',
      }}
    >
      <Paper
        variant="outlined"
        sx={{ maxWidth: 560, width: '100%', p: { xs: 3, sm: 4 } }}
      >
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <ReportProblemRoundedIcon color="error" />
            <Typography variant="h6">Something went wrong</Typography>
          </Stack>

          <Typography variant="body2" color="text.secondary">
            An unexpected error knocked this page over. It&rsquo;s not you —
            try reloading, or head back to the dashboard. The technical
            details are below if you need them.
          </Typography>

          <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<RefreshRoundedIcon />}
              onClick={handleReload}
            >
              Try again
            </Button>
            <Button
              variant="outlined"
              startIcon={<HomeRoundedIcon />}
              onClick={handleHome}
            >
              Go home
            </Button>
          </Stack>

          <Box>
            <Link
              component="button"
              type="button"
              variant="body2"
              underline="hover"
              color="text.secondary"
              onClick={toggleDetails}
              aria-expanded={expanded}
            >
              {expanded ? 'Hide' : 'Show'} error details
            </Link>
            <Collapse in={expanded} unmountOnExit>
              <Box
                component="pre"
                sx={{
                  mt: 1.5,
                  mb: 0,
                  p: 2,
                  maxHeight: 320,
                  overflow: 'auto',
                  bgcolor: 'background.default',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  borderLeft: 3,
                  borderLeftColor: 'error.main',
                  fontFamily: fonts.mono,
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: 'text.secondary',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {details}
              </Box>
            </Collapse>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
};
