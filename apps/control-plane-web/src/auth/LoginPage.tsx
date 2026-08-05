import {
  AutorenewRounded,
  BoltRounded,
  HubRounded,
  PhoneIphoneRounded,
} from '@mui/icons-material';
import { Box, Button, TextField, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import { useState, type FC, type ReactNode } from 'react';
import { useNavigate } from 'react-router';

import { fonts } from '../theme/tokens';
import { useAuth } from './useAuth';

// The terminal-style wordmark, shared by both panels so the form column still
// shows branding on mobile (where the marketing panel is hidden).
const Wordmark: FC = () => (
  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
    <Typography
      component="span"
      sx={{ color: 'primary.main', fontFamily: fonts.mono, fontWeight: 700, fontSize: 22 }}
    >
      ❯
    </Typography>
    <Typography
      component="span"
      sx={{ fontFamily: fonts.mono, fontWeight: 700, fontSize: 20, letterSpacing: '-0.02em' }}
    >
      sagewright
    </Typography>
  </Box>
);

interface Highlight {
  icon: ReactNode;
  title: string;
  body: string;
}

// Drawn from VISION.md — the four pillars of the product, kept to one line each.
const highlights: Highlight[] = [
  {
    icon: <HubRounded fontSize="small" />,
    title: 'Many agents, one control plane',
    body: 'A fresh runner per task; secrets never leave the control plane.',
  },
  {
    icon: <PhoneIphoneRounded fontSize="small" />,
    title: 'Mobile-first & resumable',
    body: 'Reconnect after a dropped connection with the transcript intact.',
  },
  {
    icon: <BoltRounded fontSize="small" />,
    title: 'Steerable',
    body: "Interject live — picked up on the agent's next loop step.",
  },
  {
    icon: <AutorenewRounded fontSize="small" />,
    title: 'Self-correcting',
    body: 'Each agent loops work → validate → reflect before opening a PR.',
  },
];

const MarketingPanel: FC = () => (
  <Box
    sx={{
      flex: '1.1 1 0',
      display: { xs: 'none', md: 'flex' },
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: 6,
      p: { md: 6, lg: 8 },
      position: 'relative',
      overflow: 'hidden',
      borderRight: 1,
      borderColor: 'divider',
      // Two surfaces deep, with a faint terminal-orange glow bleeding in from
      // the corners — the reference's geometry, rendered in our palette.
      background: (t) =>
        `radial-gradient(120% 120% at 0% 0%, ${t.palette.primary.main}1f 0%, transparent 45%),` +
        `radial-gradient(90% 90% at 100% 100%, ${t.palette.primary.main}14 0%, transparent 50%),` +
        `linear-gradient(160deg, ${t.palette.background.paper} 0%, ${t.palette.background.default} 100%)`,
    }}
  >
    {/* Oversized soft circle echoing the reference, tinted by the accent. */}
    <Box
      aria-hidden
      sx={{
        position: 'absolute',
        top: '-12%',
        right: '-8%',
        width: 420,
        height: 420,
        borderRadius: '50%',
        background: (t) => `radial-gradient(circle, ${t.palette.primary.main}22 0%, transparent 70%)`,
        pointerEvents: 'none',
      }}
    />

    <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Wordmark />
      <Box
        component="span"
        sx={{
          alignSelf: 'flex-start',
          px: 1.25,
          py: 0.5,
          borderRadius: 999,
          border: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          color: 'text.secondary',
          fontFamily: fonts.mono,
          fontSize: 12,
          letterSpacing: '0.02em',
        }}
      >
        Agent control plane
      </Box>
      <Box>
        <Typography
          variant="h3"
          sx={{ fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 }}
        >
          Dispatch the fleet.
          <br />
          Ship the work.
        </Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary', mt: 2, maxWidth: 440 }}>
          Run many coding agents at once from any device — start on your phone, watch them
          work, and reconnect without losing a line of output.
        </Typography>
      </Box>
    </Box>

    <Box
      sx={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: { md: '1fr', lg: '1fr 1fr' },
        gap: 3,
        maxWidth: 560,
      }}
    >
      {highlights.map((h) => (
        <Box key={h.title} sx={{ display: 'flex', gap: 1.5 }}>
          <Box sx={{ color: 'primary.main', mt: '2px' }}>{h.icon}</Box>
          <Box>
            <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{h.title}</Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 13 }}>{h.body}</Typography>
          </Box>
        </Box>
      ))}
    </Box>

    <Typography
      sx={{ position: 'relative', color: 'text.secondary', fontFamily: fonts.mono, fontSize: 12 }}
    >
      sagewright.dev
    </Typography>
  </Box>
);

export const LoginPage: FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isValid = name.trim().length > 0 && password.trim().length > 0;

  const onSubmit = async (): Promise<void> => {
    if (!isValid) return;
    setSubmitting(true);
    try {
      await login(name, password);
      // Land on the app root; the auth gate reads `useMe` live and renders the
      // forced-change screen when the account still `mustChangePassword` (root's first
      // login, or after an admin reset) before letting the app through.
      navigate('/');
    } catch {
      enqueueSnackbar('Login failed', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', bgcolor: 'background.default' }}>
      <MarketingPanel />

      <Box
        sx={{
          flex: '0.9 1 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: 3, sm: 4 },
        }}
      >
        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit();
          }}
          sx={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 2.5 }}
        >
          {/* Visible only on mobile, where the marketing panel is hidden. */}
          <Box sx={{ display: { xs: 'flex', md: 'none' }, mb: 1 }}>
            <Wordmark />
          </Box>

          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Welcome back
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              Sign in to reach your fleet of agents.
            </Typography>
          </Box>

          <TextField
            label="Username"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            autoComplete="username"
            required
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <Button type="submit" variant="contained" size="large" disabled={!isValid || submitting}>
            Sign in
          </Button>
        </Box>
      </Box>
    </Box>
  );
};
