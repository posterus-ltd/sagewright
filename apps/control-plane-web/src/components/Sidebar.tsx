import {
  AccountCircleRounded,
  ChevronLeftRounded,
  ChevronRightRounded,
  DarkModeRounded,
  AccountTreeRounded,
  GridViewRounded,
  InfoOutlined,
  LightModeRounded,
  LogoutRounded,
  ScheduleRounded,
  SearchRounded,
  SettingsBrightnessRounded,
  SettingsRounded,
  TerminalRounded,
} from '@mui/icons-material';
import {
  Box,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
} from '@mui/material';
import {
  useCallback,
  useState,
  type FC,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

import { useAuth } from '../auth/useAuth';
import { useThemeMode, type ThemeMode } from '../theme/ThemeModeProvider';
import { fonts } from '../theme/tokens';
import { useCommandPalette } from './command-palette/CommandPaletteProvider';
import { shortcutLabel } from './command-palette/shortcut';

const EXPANDED = 240;
const COLLAPSED = 56;
const STORAGE_KEY = 'sagewright.sidebar-collapsed';

const NAV = [
  {
    to: '/',
    label: 'Sessions',
    icon: <TerminalRounded fontSize="small" />,
    match: (p: string) => p === '/' || p.startsWith('/tasks'),
  },
  {
    to: '/canvas',
    label: 'Canvas',
    icon: <GridViewRounded fontSize="small" />,
    match: (p: string) => p.startsWith('/canvas'),
  },
  {
    to: '/scheduled',
    label: 'Scheduled Tasks',
    icon: <ScheduleRounded fontSize="small" />,
    match: (p: string) => p.startsWith('/scheduled'),
  },
  {
    to: '/workflows',
    label: 'Workflows',
    icon: <AccountTreeRounded fontSize="small" />,
    match: (p: string) => p.startsWith('/workflows'),
  },
];

interface RowProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  collapsed: boolean;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  to?: string;
  title?: string;
  trailing?: ReactNode;
}

// One sidebar entry. Becomes an icon-only target with a tooltip when collapsed.
const Row: FC<RowProps> = ({
  icon,
  label,
  active,
  collapsed,
  onClick,
  to,
  title,
  trailing,
}) => {
  const inner = (
    <Box
      component={to ? Link : 'button'}
      to={to}
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        width: '100%',
        px: 1.5,
        py: 1,
        border: 0,
        borderLeft: '2px solid',
        borderColor: active ? 'primary.main' : 'transparent',
        bgcolor: active ? 'action.selected' : 'transparent',
        color: active ? 'text.primary' : 'text.secondary',
        cursor: 'pointer',
        textDecoration: 'none',
        font: 'inherit',
        textAlign: 'left',
        transition: 'background-color 120ms, color 120ms',
        '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
        '& svg': { color: active ? 'primary.main' : 'inherit' },
      }}
    >
      <Box sx={{ display: 'flex', flexShrink: 0 }}>{icon}</Box>
      {!collapsed && (
        <Box
          component="span"
          sx={{
            fontSize: 14,
            fontWeight: active ? 600 : 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {label}
        </Box>
      )}
      {!collapsed && trailing && (
        <Box sx={{ ml: 'auto', flexShrink: 0, display: 'flex' }}>
          {trailing}
        </Box>
      )}
    </Box>
  );
  return collapsed ? (
    <Tooltip title={title ?? label} placement="right">
      {inner}
    </Tooltip>
  ) : (
    inner
  );
};

const themeIcon = (mode: ThemeMode): ReactNode => {
  if (mode === 'light') return <LightModeRounded fontSize="small" />;
  if (mode === 'dark') return <DarkModeRounded fontSize="small" />;
  return <SettingsBrightnessRounded fontSize="small" />;
};

const NEXT: Record<ThemeMode, ThemeMode> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};
const LABEL: Record<ThemeMode, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export const Sidebar: FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { open: openCommandPalette } = useCommandPalette();
  const { displayName, logout } = useAuth();
  const { mode, setMode } = useThemeMode();
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(STORAGE_KEY) === '1',
  );
  const [userAnchor, setUserAnchor] = useState<HTMLElement | null>(null);

  const toggleCollapsed = useCallback((): void => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const signOut = (): void => {
    setUserAnchor(null);
    logout();
    navigate('/login');
  };

  const settingsActive = location.pathname.startsWith('/settings');
  const aboutActive = location.pathname.startsWith('/about');

  return (
    <Box
      component="nav"
      sx={{
        width: collapsed ? COLLAPSED : EXPANDED,
        flexShrink: 0,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        borderRight: '1px solid',
        borderColor: 'divider',
        transition: 'width 160ms ease',
        overflow: 'hidden',
      }}
    >
      {/* Brand — a shell prompt. The one loud, terminal-native element. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          height: 56,
          px: 2,
          flexShrink: 0,
        }}
      >
        <Box
          component="span"
          sx={{
            color: 'primary.main',
            fontFamily: fonts.mono,
            fontWeight: 700,
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          ❯
        </Box>
        {!collapsed && (
          <Box sx={{ display: 'flex', alignItems: 'baseline' }}>
            <Box
              component="span"
              sx={{
                fontFamily: fonts.mono,
                fontWeight: 700,
                fontSize: 16,
                letterSpacing: '-0.02em',
                color: 'text.primary',
              }}
            >
              sagewright
            </Box>
            <Box
              component="span"
              sx={{
                ml: 0.5,
                width: 8,
                height: 16,
                bgcolor: 'primary.main',
                display: 'inline-block',
                animation: 'sagewright-blink 1.1s step-end infinite',
                '@keyframes sagewright-blink': { '50%': { opacity: 0 } },
                '@media (prefers-reduced-motion: reduce)': {
                  animation: 'none',
                },
              }}
            />
          </Box>
        )}
      </Box>
      <Divider />

      {/* Quick actions — opens the command palette (⌘+K / Ctrl+K) */}
      <Box sx={{ display: 'flex', flexDirection: 'column', pt: 1 }}>
        <Row
          icon={<SearchRounded fontSize="small" />}
          label="Quick actions"
          title={`Quick actions (${shortcutLabel})`}
          collapsed={collapsed}
          onClick={() => openCommandPalette()}
          trailing={
            <Box
              component="span"
              sx={{
                fontFamily: fonts.mono,
                fontSize: 11,
                lineHeight: 1.4,
                px: 0.75,
                py: 0.25,
                borderRadius: 0.75,
                border: '1px solid',
                borderColor: 'divider',
                color: 'text.secondary',
                whiteSpace: 'nowrap',
              }}
            >
              {shortcutLabel}
            </Box>
          }
        />
      </Box>

      {/* Routes */}
      <Box sx={{ display: 'flex', flexDirection: 'column', py: 1, gap: 0.5 }}>
        {NAV.map((item) => (
          <Row
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
            collapsed={collapsed}
            active={item.match(location.pathname)}
          />
        ))}
      </Box>

      <Box sx={{ flexGrow: 1 }} />

      {/* Settings · theme · user */}
      <Box sx={{ display: 'flex', flexDirection: 'column', py: 1, gap: 0.5 }}>
        <Row
          to="/settings"
          icon={<SettingsRounded fontSize="small" />}
          label="Settings"
          collapsed={collapsed}
          active={settingsActive}
        />
        <Row
          to="/about"
          icon={<InfoOutlined fontSize="small" />}
          label="About"
          collapsed={collapsed}
          active={aboutActive}
        />
        <Row
          icon={themeIcon(mode)}
          label={`Theme: ${LABEL[mode]}`}
          title={`Theme: ${LABEL[mode]}`}
          collapsed={collapsed}
          onClick={() => setMode(NEXT[mode])}
        />
        <Row
          icon={<AccountCircleRounded fontSize="small" />}
          label={displayName ?? 'Account'}
          title={displayName ?? 'Account'}
          collapsed={collapsed}
          onClick={(e) => setUserAnchor(e.currentTarget)}
        />
        <Divider sx={{ my: 0.5 }} />
        <Row
          icon={
            collapsed ? (
              <ChevronRightRounded fontSize="small" />
            ) : (
              <ChevronLeftRounded fontSize="small" />
            )
          }
          label="Collapse"
          title="Expand"
          collapsed={collapsed}
          onClick={toggleCollapsed}
        />
      </Box>

      <Menu
        anchorEl={userAnchor}
        open={Boolean(userAnchor)}
        onClose={() => setUserAnchor(null)}
      >
        <MenuItem onClick={signOut}>
          <ListItemIcon>
            <LogoutRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText>Sign out</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
};
