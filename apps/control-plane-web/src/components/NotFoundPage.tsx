import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import { Box, Button, Stack, Typography, useTheme } from '@mui/material';
import { type FC } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { usePrefersReducedMotion } from '../galaxy/usePrefersReducedMotion';
import { useAppHeight } from '../theme/layout';
import { fonts } from '../theme/tokens';

/**
 * A little flying saucer that hovers over a green tractor beam and abducts the
 * page you were looking for. Drawn inline so it inherits the active theme's
 * colours (readable metal in both light and dark) and needs no asset request.
 *
 * The bob, beam flicker, and rising abductee are pure CSS keyframes defined on
 * the wrapper's `sx`; when the visitor prefers reduced motion we drop them all
 * and render a still frame instead.
 */
const Ufo: FC<{ readonly still: boolean }> = ({ still }) => {
  const { palette } = useTheme();
  const metal = palette.text.primary;
  const beam = palette.success.main;
  const dome = palette.info.main;

  return (
    <Box
      aria-hidden
      sx={{
        width: { xs: 200, sm: 240 },
        // Animations target the SVG's classed parts. Reduced motion => none.
        '@keyframes sw-bob': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        '@keyframes sw-beam': {
          '0%, 100%': { opacity: 0.55 },
          '50%': { opacity: 0.9 },
        },
        '@keyframes sw-abduct': {
          '0%': { transform: 'translateY(28px)', opacity: 0 },
          '25%': { opacity: 1 },
          '85%': { opacity: 0.9 },
          '100%': { transform: 'translateY(-6px)', opacity: 0 },
        },
        '@keyframes sw-blink': { '50%': { opacity: 0.25 } },
        '& .sw-ship': still
          ? undefined
          : { animation: 'sw-bob 3.2s ease-in-out infinite' },
        '& .sw-ray': still
          ? { opacity: 0.7 }
          : { animation: 'sw-beam 2.4s ease-in-out infinite' },
        '& .sw-abductee': still
          ? { opacity: 0.9 }
          : { animation: 'sw-abduct 2.8s ease-in-out infinite' },
        '& .sw-light': still
          ? undefined
          : { animation: 'sw-blink 1.6s ease-in-out infinite' },
        '& .sw-light-2': { animationDelay: '0.4s' },
        '& .sw-light-3': { animationDelay: '0.8s' },
      }}
    >
      <svg
        viewBox="0 0 200 220"
        width="100%"
        role="img"
        aria-label="A flying saucer beaming up a lost page"
      >
        <defs>
          <linearGradient id="sw-beam-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={beam} stopOpacity="0.5" />
            <stop offset="100%" stopColor={beam} stopOpacity="0" />
          </linearGradient>
          <radialGradient id="sw-dome-grad" cx="0.4" cy="0.3" r="0.75">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="100%" stopColor={dome} stopOpacity="0.55" />
          </radialGradient>
        </defs>

        {/* The whole craft bobs; the beam and abductee ride along with it. */}
        <g className="sw-ship">
          <path
            className="sw-ray"
            d="M74 92 L44 208 L156 208 L126 92 Z"
            fill="url(#sw-beam-grad)"
          />
          {/* The lost page, tumbling up into the ship. */}
          <g className="sw-abductee">
            <rect
              x="86"
              y="150"
              width="28"
              height="34"
              rx="3"
              fill={palette.background.paper}
              stroke={metal}
              strokeWidth="2"
            />
            <line x1="92" y1="160" x2="108" y2="160" stroke={metal} strokeWidth="2" />
            <line x1="92" y1="167" x2="108" y2="167" stroke={metal} strokeWidth="2" />
            <line x1="92" y1="174" x2="102" y2="174" stroke={metal} strokeWidth="2" />
          </g>

          {/* Saucer. */}
          <ellipse cx="100" cy="84" rx="60" ry="21" fill={metal} opacity="0.35" />
          <ellipse cx="100" cy="80" rx="60" ry="19" fill={metal} />
          <path d="M72 74 A 30 24 0 0 1 128 74 Z" fill="url(#sw-dome-grad)" />
          {/* Rim lights. */}
          <circle className="sw-light" cx="66" cy="82" r="4.5" fill={beam} />
          <circle className="sw-light sw-light-2" cx="100" cy="88" r="4.5" fill={dome} />
          <circle className="sw-light sw-light-3" cx="134" cy="82" r="4.5" fill={beam} />
        </g>
      </svg>
    </Box>
  );
};

/**
 * The 404 page for routes that don't exist. Reached via the catch-all route in
 * `router.tsx` (and by the route error boundary when a loader answers 404), so
 * a mistyped URL lands here with a way home instead of the generic fault page.
 *
 * Navigation home uses react-router rather than a hard reload: unlike a caught
 * render crash, a 404 leaves the app's state perfectly intact, so there's
 * nothing to reboot.
 */
export const NotFoundPage: FC = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const reducedMotion = usePrefersReducedMotion();
  const appH = useAppHeight();

  return (
    <Box
      sx={{
        minHeight: appH,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 3,
        bgcolor: 'background.default',
      }}
    >
      <Stack spacing={3} sx={{ maxWidth: 460, width: '100%', alignItems: 'center', textAlign: 'center' }}>
        <Ufo still={reducedMotion} />

        <Typography
          component="h1"
          sx={{
            fontFamily: fonts.mono,
            fontWeight: 700,
            lineHeight: 1,
            fontSize: { xs: 72, sm: 88 },
            letterSpacing: '0.04em',
          }}
        >
          404
        </Typography>

        <Stack spacing={1}>
          <Typography variant="h6">This page got abducted.</Typography>
          <Typography variant="body2" color="text.secondary">
            We swept the galaxy and found no signal from{' '}
            <Box component="code" sx={{ fontFamily: fonts.mono, wordBreak: 'break-all' }}>
              {pathname}
            </Box>
            . It was either never here or has been beamed to another dimension.
          </Typography>
        </Stack>

        <Button
          variant="contained"
          startIcon={<HomeRoundedIcon />}
          onClick={() => navigate('/')}
        >
          Beam me home
        </Button>
      </Stack>
    </Box>
  );
};
